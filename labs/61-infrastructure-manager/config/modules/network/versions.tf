terraform {
  # A reusable module declares a minimum provider version only.
  # It never configures providers or backends.
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 6.0.0"
    }
  }
}
