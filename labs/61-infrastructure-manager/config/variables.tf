variable "project_id" {
  description = "ID of the lab project."
  type        = string
}

variable "region" {
  description = "Region for the subnet."
  type        = string
}

variable "zone" {
  description = "Zone for the VM."
  type        = string
}

variable "environment" {
  description = "Value of the environment label on the VM."
  type        = string
  default     = "dev"
}

variable "subnet_cidr" {
  description = "Primary IPv4 range of the lab subnet."
  type        = string
  default     = "10.61.0.0/24"
}
