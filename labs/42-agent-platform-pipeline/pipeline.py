#!/usr/bin/env python3
"""Define and compile a two-step Kubeflow Pipelines (KFP) pipeline for lab 42.

Step 1 (make-data) writes a small CSV file of random numbers as a Dataset
artifact. Step 2 (summarize) reads the file, logs two metrics, and returns the
mean. The seed parameter is part of the cache key: a run with a new seed runs
both steps, and a run with an earlier seed can reuse the cached results.
Each step asks for 2 vCPUs and 8 GB, so Agent Platform Pipelines picks a
2-vCPU machine type instead of the default e2-standard-4.

The script only compiles the pipeline to a YAML file on your computer.
It does not call Google Cloud.

Example:
  python3 labs/42-agent-platform-pipeline/pipeline.py "$LAB42_DIR/pipeline.yaml"
"""
import sys

from kfp import compiler, dsl
from kfp.dsl import Dataset, Input, Metrics, Output


@dsl.component(base_image="python:3.11")
def make_data(rows: int, seed: int, data: Output[Dataset]):
    import random

    random.seed(seed)
    with open(data.path, "w") as f:
        f.write("x\n")
        for _ in range(rows):
            f.write(f"{random.random()}\n")
    data.metadata["rows"] = rows


@dsl.component(base_image="python:3.11")
def summarize(data: Input[Dataset], metrics: Output[Metrics]) -> float:
    with open(data.path) as f:
        values = [float(v) for v in f.read().splitlines()[1:]]
    mean = sum(values) / len(values)
    metrics.log_metric("rows", len(values))
    metrics.log_metric("mean", mean)
    return mean


@dsl.pipeline(name="lab42-tiny-pipeline", description="Make a small dataset, then summarize it.")
def tiny_pipeline(rows: int = 1000, seed: int = 42):
    data_task = make_data(rows=rows, seed=seed).set_cpu_limit("2").set_memory_limit("8G")
    summarize(data=data_task.outputs["data"]).set_cpu_limit("2").set_memory_limit("8G")


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "lab42_pipeline.yaml"
    compiler.Compiler().compile(pipeline_func=tiny_pipeline, package_path=out)
    print(f"Compiled the pipeline to {out}")
