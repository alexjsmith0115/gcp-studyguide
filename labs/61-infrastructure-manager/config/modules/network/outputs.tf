output "network_name" {
  description = "Name of the VPC network."
  value       = google_compute_network.main.name
}

output "network_self_link" {
  description = "Self link of the VPC network."
  value       = google_compute_network.main.self_link
}

output "subnet_self_link" {
  description = "Self link of the subnet."
  value       = google_compute_subnetwork.main.self_link
}
