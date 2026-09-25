# No credentials here: Infrastructure Manager runs Terraform as the
# service account that you pass to the deployment.
provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}
