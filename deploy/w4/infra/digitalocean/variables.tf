variable "environment" {
  type = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Choose staging or production."
  }
}

variable "region" {
  type = string
}

variable "droplet_size" {
  type = string
}

variable "ssh_key_fingerprints" {
  type = list(string)
  validation {
    condition     = length(var.ssh_key_fingerprints) > 0
    error_message = "Provide at least one existing DigitalOcean SSH key fingerprint."
  }
}

variable "admin_cidrs" {
  type = list(string)
  validation {
    condition = length(var.admin_cidrs) > 0 && alltrue([
      for address in var.admin_cidrs : can(cidrhost(address, 0)) && !contains(["0.0.0.0/0", "::/0"], address)
    ])
    error_message = "Provide specific administrator IP ranges, not the whole Internet."
  }
}

variable "vpc_cidr" {
  type = string
  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "Provide a valid private CIDR that does not overlap existing networks."
  }
}

variable "backups_enabled" {
  type = bool
}

variable "enable_public_web" {
  type    = bool
  default = false
}
