variable "project_id" {
  description = "ID of the lab project. labs/env.sh sets TF_VAR_project_id."
  type        = string
}

variable "region" {
  description = "Region for the subnet. labs/env.sh sets TF_VAR_region."
  type        = string
}

variable "zone" {
  description = "Zone for the VM. labs/env.sh sets TF_VAR_zone."
  type        = string
}

variable "subnet_cidr" {
  description = "Primary IPv4 range of the lab subnet."
  type        = string
  default     = "10.60.0.0/24"
}
