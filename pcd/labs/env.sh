# Source this file at the start of every PCD lab shell, from the repository root:
#   source pcd/labs/env.sh
#
# It scopes gcloud, bq, kubectl, and Terraform in THIS shell to the dedicated
# lab configuration "pcd-lab" (created in pcd/labs/00-setup). Your default
# gcloud configuration and other shells are not changed.
#
# Safety: it refuses to continue unless the lab project ID starts with "pcd-lab-".

_pcd_fail() { echo "pcd/labs/env.sh: $*" >&2; return 1; }

if ! gcloud config configurations describe pcd-lab >/dev/null 2>&1; then
  _pcd_fail "gcloud configuration 'pcd-lab' not found. Run pcd/labs/00-setup first." || return 1
fi

export CLOUDSDK_ACTIVE_CONFIG_NAME=pcd-lab
PROJECT_ID="$(gcloud config get-value project 2>/dev/null)"

case "$PROJECT_ID" in
  pcd-lab-*) ;;
  *) unset CLOUDSDK_ACTIVE_CONFIG_NAME
     _pcd_fail "project '$PROJECT_ID' does not start with 'pcd-lab-'. Refusing to continue." || return 1 ;;
esac

export PROJECT_ID
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
export REGION="$(gcloud config get-value run/region 2>/dev/null)"; REGION="${REGION:-$(gcloud config get-value compute/region 2>/dev/null)}"; REGION="${REGION:-us-central1}"
export ZONE="$(gcloud config get-value compute/zone 2>/dev/null)";   ZONE="${ZONE:-us-central1-a}"
# Client libraries in this shell use the lab project, and bill API quota to it,
# without a change to your Application Default Credentials file.
export GOOGLE_CLOUD_PROJECT="$PROJECT_ID" GOOGLE_CLOUD_QUOTA_PROJECT="$PROJECT_ID"
export TF_VAR_project_id="$PROJECT_ID" TF_VAR_region="$REGION" TF_VAR_zone="$ZONE"
# kubectl in this shell reads and writes a lab-only kubeconfig file, so lab
# commands cannot reach the clusters in your normal ~/.kube/config.
mkdir -p "$HOME/.kube" && export KUBECONFIG="$HOME/.kube/pcd-lab-config"
case "${PS1:-}" in "(pcd-lab) "*) ;; *) PS1="(pcd-lab) ${PS1:-}" ;; esac

echo "PCD lab shell ready: project=$PROJECT_ID region=$REGION zone=$ZONE"
