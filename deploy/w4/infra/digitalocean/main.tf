resource "digitalocean_vpc" "w4" {
  name     = "w4-boxesai-${var.environment}"
  region   = var.region
  ip_range = var.vpc_cidr
}

resource "digitalocean_droplet" "w4" {
  name       = "w4-boxesai-${var.environment}"
  region     = var.region
  size       = var.droplet_size
  image      = "ubuntu-24-04-x64"
  ssh_keys   = var.ssh_key_fingerprints
  vpc_uuid   = digitalocean_vpc.w4.id
  monitoring = true
  backups    = var.backups_enabled
  ipv6       = true
  tags       = ["w4-boxesai", var.environment]

  lifecycle {
    prevent_destroy = true
  }
}

resource "digitalocean_firewall" "w4" {
  name        = "w4-boxesai-${var.environment}"
  droplet_ids = [digitalocean_droplet.w4.id]

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = var.admin_cidrs
  }

  dynamic "inbound_rule" {
    for_each = var.enable_public_web ? ["80", "443"] : []
    content {
      protocol         = "tcp"
      port_range       = inbound_rule.value
      source_addresses = ["0.0.0.0/0", "::/0"]
    }
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

output "server_address" {
  value = digitalocean_droplet.w4.ipv4_address
}

output "private_server_address" {
  value = digitalocean_droplet.w4.ipv4_address_private
}
