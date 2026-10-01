"""Telemetry for both lab70 services: OpenTelemetry traces and JSON logs on stdout.

The OTLP gRPC exporter sends spans from the process to the Telemetry API
(telemetry.googleapis.com), as in "Migrate from the Trace exporter to the OTLP
endpoint". On Cloud Run, Google recommends an OpenTelemetry Collector sidecar.
Direct export keeps each service in one container.
"""
import json
import os

import google.auth
import google.auth.transport.grpc
import google.auth.transport.requests
import grpc
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.flask import FlaskInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.trace.sampling import ALWAYS_OFF, ParentBased

PROJECT_ID = os.environ["GOOGLE_CLOUD_PROJECT"]  # set by the deploy command


def setup_tracing(app):
    # Application Default Credentials: on Cloud Run, the service account of the service.
    credentials, _ = google.auth.default()
    request = google.auth.transport.requests.Request()
    auth_plugin = google.auth.transport.grpc.AuthMetadataPlugin(
        credentials=credentials, request=request)
    channel_creds = grpc.composite_channel_credentials(
        grpc.ssl_channel_credentials(), grpc.metadata_call_credentials(auth_plugin))
    resource = Resource.create(attributes={
        SERVICE_NAME: os.environ["K_SERVICE"],  # Cloud Run sets K_SERVICE to the service name
        "gcp.project_id": PROJECT_ID,  # required by the Telemetry API: names your project
    })
    # ParentBased: follow the sampled flag of the incoming traceparent header (Cloud Run decides).
    # ALWAYS_OFF: start no trace without a parent, for example for token requests in the background.
    provider = TracerProvider(resource=resource, sampler=ParentBased(ALWAYS_OFF))
    # BatchSpanProcessor exports from a background thread: use instance-based billing on Cloud Run.
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(
        credentials=channel_creds, endpoint="https://telemetry.googleapis.com:443/v1/traces")))
    trace.set_tracer_provider(provider)
    FlaskInstrumentor().instrument_app(app)  # server spans: reads the incoming traceparent header
    RequestsInstrumentor().instrument()  # client spans: adds traceparent to outgoing requests


def log(severity, message, **fields):
    """Write one structured log entry: one JSON object on one line of stdout."""
    span = trace.get_current_span().get_span_context()
    if span.is_valid:  # special fields that link the log entry to the trace and to the span
        trace_id = f"{span.trace_id:032x}"
        # Legacy format, as in the Cloud Run logging sample. Preferred format: the trace ID alone.
        fields["logging.googleapis.com/trace"] = f"projects/{PROJECT_ID}/traces/{trace_id}"
        fields["logging.googleapis.com/spanId"] = f"{span.span_id:016x}"
        fields["logging.googleapis.com/trace_sampled"] = span.trace_flags.sampled
    print(json.dumps({"severity": severity, "message": message, **fields}), flush=True)
