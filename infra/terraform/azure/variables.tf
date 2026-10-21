variable "subscription_id" {
  description = "Azure subscription id"
  type        = string
}

variable "prefix" {
  description = "Name prefix for all resources"
  type        = string
  default     = "supportcopilot"
}

variable "location" {
  description = "Azure region (Central India keeps customer data in-country)"
  type        = string
  default     = "centralindia"
}

variable "aks_node_vm_size" {
  type    = string
  default = "Standard_D2s_v5"
}

variable "aks_min_nodes" {
  type    = number
  default = 2
}

variable "aks_max_nodes" {
  type    = number
  default = 5
}

variable "postgres_sku" {
  type    = string
  default = "B_Standard_B1ms"
}

variable "redis_sku" {
  description = "Basic | Standard | Premium"
  type        = string
  default     = "Standard"
}

variable "tags" {
  type = map(string)
  default = {
    project = "brand-support-copilot"
    managed = "terraform"
  }
}
