# Source this file at the start of every lab shell:   source labs/env.sh
#
# It scopes gcloud, bq, and Terraform in THIS shell to the dedicated lab
# configuration "pca-lab" (created in labs/00-setup). Your default gcloud
# configuration and other shells are not changed.
#
# Safety: it refuses to continue unless the lab project ID starts with "pca-lab-".

_pca_fail() { echo "labs/env.sh: $*" >&2; return 1; }

if ! gcloud config configurations describe pca-lab >/dev/null 2>&1; then
  _pca_fail "gcloud configuration 'pca-lab' not found. Run labs/00-setup first." || return 1
fi

export CLOUDSDK_ACTIVE_CONFIG_NAME=pca-lab
PROJECT_ID="$(gcloud config get-value project 2>/dev/null)"

case "$PROJECT_ID" in
  pca-lab-*) ;;
  *) unset CLOUDSDK_ACTIVE_CONFIG_NAME
     _pca_fail "project '$PROJECT_ID' does not start with 'pca-lab-'. Refusing to continue." || return 1 ;;
esac

export PROJECT_ID
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
export REGION="$(gcloud config get-value compute/region 2>/dev/null)"; REGION="${REGION:-us-central1}"
export ZONE="$(gcloud config get-value compute/zone 2>/dev/null)";   ZONE="${ZONE:-us-central1-a}"
export TF_VAR_project_id="$PROJECT_ID" TF_VAR_region="$REGION" TF_VAR_zone="$ZONE"
case "${PS1:-}" in "(pca-lab) "*) ;; *) PS1="(pca-lab) ${PS1:-}" ;; esac

echo "Lab shell ready: project=$PROJECT_ID region=$REGION zone=$ZONE"
