terraform {
  # Terraform 1.5 added configuration-driven import blocks (step 10).
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source = "hashicorp/google"
      # Root modules pin providers to a minor version.
      version = "~> 8.4.0"
    }
  }
}
