# Azure infrastructure (plan-only)

AKS + PostgreSQL Flexible Server (private VNet) + Azure Cache for Redis + Key Vault, in
Central India. Not applied as part of this exercise.

```bash
terraform init
terraform plan -var subscription_id=<sub-id>
```

Secrets: the DB and Redis connection strings are written to Key Vault; add `NUGEN-API-KEY`
and `CLIENT-API-KEYS` out of band and mount them into pods with the Secrets Store CSI driver
(enabled on the cluster). Use a remote azurerm backend for state in real use.
