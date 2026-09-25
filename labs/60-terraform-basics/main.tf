# Root module: calls the local network module and adds one small VM.

module "network" {
  source = "./modules/network"

  project_id   = var.project_id
  region       = var.region
  network_name = "lab60-vpc"
  subnet_name  = "lab60-subnet"
  subnet_cidr  = var.subnet_cidr
  iap_ssh_tag  = "lab60-iap-ssh"
}

resource "google_compute_instance" "main" {
  name         = "lab60-vm"
  machine_type = "e2-micro"
  zone         = var.zone
  tags         = ["lab60-iap-ssh"]

  labels = {
    lab = "lab60"
  }

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 10
      type  = "pd-standard"
    }
  }

  # No access_config block: the VM gets no external IP address.
  network_interface {
    subnetwork = module.network.subnet_self_link
  }

  shielded_instance_config {
    enable_secure_boot = true
  }
}
