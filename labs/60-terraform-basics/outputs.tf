output "network_name" {
  description = "Name of the VPC network."
  value       = module.network.network_name
}

output "vm_name" {
  description = "Name of the VM."
  value       = google_compute_instance.main.name
}

output "vm_internal_ip" {
  description = "Internal IP address of the VM."
  value       = google_compute_instance.main.network_interface[0].network_ip
}
