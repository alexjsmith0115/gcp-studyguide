# No backend block: Infrastructure Manager stores the state for each revision.
terraform {
  # Infrastructure Manager runs only its supported Terraform versions.
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.4.0"
    }
  }
}
