variable "project_id" {
  description = "Project that owns the network."
  type        = string
}

variable "region" {
  description = "Region of the subnet."
  type        = string
}

variable "network_name" {
  description = "Name of the custom-mode VPC network."
  type        = string
}

variable "subnet_name" {
  description = "Name of the subnet."
  type        = string
}

variable "subnet_cidr" {
  description = "Primary IPv4 range of the subnet."
  type        = string
}

variable "iap_ssh_tag" {
  description = "Network tag of the VMs that accept SSH from IAP TCP forwarding."
  type        = string
}
