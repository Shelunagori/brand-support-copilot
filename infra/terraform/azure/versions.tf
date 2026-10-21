terraform {
  required_version = ">= 1.6"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
  # Plan-only exercise: local state. For real use, configure an azurerm backend
  # (storage account + container) with state locking.
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}
