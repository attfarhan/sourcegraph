# Sourcegraph Helm Chart

## Requirements

* [Helm 3 CLI](https://helm.sh/docs/intro/install/)
* Kubernetes 1.19 or greater

## Quickstart

To use the Helm chart, add the Sourcegraph helm repository:
 
```sh
helm repo add sourcegraph https://sourcegraph.github.io/deploy-sourcegraph-helm/
```

Install the Sourcegraph chart using default values:

```sh
helm install --version 0.7.0 sourcegraph sourcegraph/sourcegraph
```

## Configuration 

The Sourcegraph chart is highly customizable to support a wide range of environments. Please review the default values from [values.yaml](https://github.com/sourcegraph/deploy-sourcegraph-helm/blob/main/charts/sourcegraph/values.yaml) and all [supported options](https://github.com/sourcegraph/deploy-sourcegraph-helm/tree/main/charts/sourcegraph#configuration-options). Customizations can be applied using an override file. Using an override file allows customizations to persist through upgrades without needing to manage merge conflicts.

To customize configuration settings with an override file, create an empty yaml file (e.g. `override.yaml`) to get started.

> WARNING: __DO NOT__ copy the [default values file](https://github.com/sourcegraph/deploy-sourcegraph-helm/blob/main/charts/sourcegraph/values.yaml) as a boilerplate for your override file. You risk having outdated values during upgrades.

Example overrides can be found in the [examples](https://github.com/sourcegraph/deploy-sourcegraph-helm/tree/main/charts/sourcegraph/examples) folder. Please take a look at our examples before providing your own configuration and consider using them as boilerplates.

Provide the override file to helm:

```sh
helm upgrade --install --values ./override.yaml --version 0.7.0 sourcegraph sourcegraph/sourcegraph
```

When making configuration changes, it's recommended to review the changes that will be applied - see [Reviewing Changes](#reviewing-changes) for more details.

### Using external PostgreSQL databases

To use external PostgreSQL databases, first review our [general recommendations](https://docs.sourcegraph.com/admin/external_services/postgres#using-your-own-postgresql-server) and [required postgres permissions](https://docs.sourcegraph.com/admin/external_services/postgres#postgres-permissions-and-database-migrations). Then you may come back to add the following values to your override file.

Prior to installing the chart, you should store these sensitive environment variables in [Secrets](https://kubernetes.io/docs/concepts/configuration/secret/).

`pgsql-credentials.Secret.yaml`
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: sourcegraph-pgsql-credentials
data:
  # notes: secrets data has to be base64-encoded
  PGPASSWORD: ""
```

`codeintel-db-credentials.Secret.yaml`
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: sourcegraph-codeintel-db-credentials
data:
  # notes: secrets data has to be base64-encoded
  CODEINTEL_PGPASSWORD: ""
```

[override.yaml](https://github.com/sourcegraph/deploy-sourcegraph-helm/tree/main/charts/sourcegraph/examples/external-databases/override.yaml)
```yaml
frontend:
  env:
    PGHOST:
      value: pgsql.database.company.com # external pgsql host
    PGPORT:
      value: "5432" # external pgsql port
    PGDATABASE:
      value: sg # external pgsql database name
    PGUSER:
      value: sg # external pgsql user
    PGPASSWORD:
      valueFrom:
        secretKeyRef: # Pre-existing secret, not created by this chart
          name: sourcegraph-pgsql-credentials
          key: PGPASSWORD
    CODEINTEL_PGHOST:
      value: codeintel-db.database.company.com # external codeintel-db host
    CODEINTEL_PGPORT:
      value: "5432" # external codeintel-db port
    CODEINTEL_PGDATABASE:
      value: sg # external codeintel-db database name
    CODEINTEL_PGUSER:
      value: sg # external codeintel-db user
    CODEINTEL_PGPASSWORD:
      valueFrom:
        secretKeyRef: # Pre-existing secret, not created by this chart
          name: sourcegraph-codeintel-db-credentials
          key: CODEINTEL_PGPASSWORD

pgsql:
  enabled: false # disable internal pgsql database

codeIntelDB:
  enabled: false # disable internal codeintel-db database
```

### Using external Redis instances

To use external Redis instances, first review our [general recommendations](https://docs.sourcegraph.com/admin/external_services/redis).

<!-- 
  If we copy the entire README.md over here the page will be too clutterd.
  When the docsite V2 is ready, this should potentially have its own page
-->
Follow [using your own Redis](https://github.com/sourcegraph/deploy-sourcegraph-helm/tree/main/charts/sourcegraph/examples/external-redis) to configure your override file.

### Using external Object Storage

To use external Object Storage service (S3-compatible services, or GCS), first review our [general recommendations](https://docs.sourcegraph.com/admin/external_services/object_storage). Then you may come back to add the following values to your override file.

Prior to installing the chart, you should store these sensitive environment variables in [Secrets](https://kubernetes.io/docs/concepts/configuration/secret/).

> The example override assumes the use of AWS S3. You may configure the environment variables accordingly for your own use case based on our [general recommendations](https://docs.sourcegraph.com/admin/external_services/object_storage).

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: sourcegraph-s3-credentials
data:
  # notes: secrets data has to be base64-encoded
  PRECISE_CODE_INTEL_UPLOAD_AWS_ACCESS_KEY_ID: ""
  PRECISE_CODE_INTEL_UPLOAD_AWS_SECRET_ACCESS_KEY: ""
```

[override.yaml](https://github.com/sourcegraph/deploy-sourcegraph-helm/tree/main/charts/sourcegraph/examples/external-object-storage/override.yaml)
```yaml
# we use YAML anchors and alias to keep override file clean
objectStorageEnv: &objectStorageEnv
  PRECISE_CODE_INTEL_UPLOAD_BACKEND:
    value: S3 # external object stoage type, one of "S3" or "GCS"
  PRECISE_CODE_INTEL_UPLOAD_BUCKET:
    value: lsif-uploads # external object storage bucket name
  PRECISE_CODE_INTEL_UPLOAD_AWS_ENDPOINT:
    value: https://s3.us-east-1.amazonaws.com
  PRECISE_CODE_INTEL_UPLOAD_AWS_REGION:
    value: us-east-1
  PRECISE_CODE_INTEL_UPLOAD_AWS_ACCESS_KEY_ID:
    secretKeyRef: # Pre-existing secret, not created by this chart
      name: sourcegraph-s3-credentials
      key: PRECISE_CODE_INTEL_UPLOAD_AWS_ACCESS_KEY_ID
  PRECISE_CODE_INTEL_UPLOAD_AWS_SECRET_ACCESS_KEY:
    secretKeyRef: # Pre-existing secret, not created by this chart
      name: sourcegraph-s3-credentials
      key: PRECISE_CODE_INTEL_UPLOAD_AWS_SECRET_ACCESS_KEY

frontend:
  env:
    <<: *objectStorageEnv

preciseCodeIntel:
  env:
    <<: *objectStorageEnv
```

## Cloud providers guides

This section is aimed at providing high-level guidance on deploying Sourcegraph via Helm on major Cloud providers. In general, you need the following to get started:

- A working Kubernetes cluster 1.19 and higher
- The ability to provision persistent volumes, e.g. Block Storage [CSI storage driver](https://kubernetes-csi.github.io/docs/drivers.html) is installed.
- The cluster should have Ingress Controller installed, e.g. platform native ingress controller, [NGINX Ingress Controller].
- You can have control over your `company.com` domain to create DNS records for Sourcegraph, e.g. `sourcegraph.company.com`

### Configure Sourcegraph on Google Kubernetes Engine (GKE)

#### Prerequisites

You need to have a GKE cluster (>=1.19) with the following addons enabled:

> Alternatively, you may consider using your custom Ingress Controller and disable `HTTP Load Balancing` add-on, [learn more](https://cloud.google.com/kubernetes-engine/docs/how-to/custom-ingress-controller).

- [x] HTTP Load Balancing
- [x] Compute Engine persistent disk CSI Driver

Your account should have sufficient access equivalent to the `cluster-admin` ClusterRole.

#### Steps

> [Container-native load balancing] is only available on VPC-native cluster. For legacy clusters, [learn more](https://cloud.google.com/kubernetes-engine/docs/how-to/load-balance-ingress).

Create an override file with the following values. We configure Ingress to use [Container-native load balancing] to expose Sourcegraph publicly on a domain of your choosing and Storage Class to use [Compute Engine persistent disk].

[override.yaml](https://github.com/sourcegraph/deploy-sourcegraph-helm/tree/main/charts/sourcegraph/examples/gcp/override.yaml)
```yaml
frontend:
  serviceType: ClusterIP
  ingress:
    enabled: true
    annotations:
      kubernetes.io/ingress.class: null
    ingressClassName: gce
    host: sourcegraph.company.com # Replace with your actual domain
  serviceAnnotations:
    cloud.google.com/neg: '{"ingress": true}'
    # reference the `BackendConfig` CR we will be configuring at a later step
    beta.cloud.google.com/backend-config: '{"default": "sourcegraph-frontend"}'

storageClass:
  create: true
  type: pd-ssd # This configures SSDs (recommended).
  provisioner: pd.csi.storage.gke.io
  volumeBindingMode: WaitForFirstConsumer
  reclaimPolicy: Retain
```

Install the chart

```sh
helm upgrade --install --values ./override.yaml --version 0.7.0 sourcegraph sourcegraph/sourcegraph
```

You need to deploy the [BackendConfig] CRD to properly expose Sourcegraph publicly. The [BackendConfig] CR should be deployed in the same namespace where the Sourcegraph chart is installed.

[sourcegraph-frontend.BackendConfig.yaml](https://github.com/sourcegraph/deploy-sourcegraph-helm/blob/michael/improve-gcp-example/charts/sourcegraph/examples/gcp/sourcegraph-frontend.BackendConfig.yaml)
```yaml
apiVersion: cloud.google.com/v1
kind: BackendConfig
metadata:
  name: sourcegraph-frontend
spec:
  healthCheck:
    checkIntervalSec: 5
    timeoutSec: 5
    requestPath: /ready
    port: 6060 # we use a custom port to perform healthcheck
```

```sh
kubectl apply -f sourcegraph-frontend.BackendConfig.yaml
```

It will take around 10 minutes for the load balancer to be fully ready, you may check on the status and obtain the load balancer IP:

```sh
kubectl describe ingress sourcegraph-frontend
```

Upon obtaining the allocated IP address of the load balancer, you should create an A record for the `sourcegraph.company.com` domain. Finally, it is recommended to enable TLS and you may consider using [Google-managed certificate](https://cloud.google.com/kubernetes-engine/docs/how-to/managed-certs) in GKE.

Upon creating the Google-managed certificate, you may add the following annotations to Ingress.

```yaml
frontend:
  ingress:
    annotations:
      kubernetes.io/ingress.class: null
      networking.gke.io/managed-certificates: managed-cert # replace with actual Google-managed certificate name
      # if you reserve a static IP, uncomment below and update ADDRESS_NAME
      # also, make changes to your DNS record accordingly
      # kubernetes.io/ingress.global-static-ip-name: ADDRESS_NAME
```

### Configure Sourcegraph on Elastic Kubernetes Service (EKS)

#### Prerequisites

You need to have a EKS cluster (>=1.19) with the following addons enabled:

> You may consider deploying your own Ingress Controller instead of ALB Ingress Controller, [learn more](https://kubernetes.github.io/ingress-nginx/)

- [x] [AWS Load Balancer Controller]
- [x] [AWS EBS CSI driver]

Your account should have sufficient access equivalent to the `cluster-admin` ClusterRole.

#### Steps

Create an override file with the following values. We configure Ingress to use [AWS Load Balancer Controller] to expose Sourcegraph publicly on a domain of your choosing and Storage Class to use [AWS EBS CSI driver].

[override.yaml](https://github.com/sourcegraph/deploy-sourcegraph-helm/tree/main/charts/sourcegraph/examples/aws/override.yaml)
```yaml
frontend:
  ingress:
    enabled: true
    annotations:
      kubernetes.io/ingress.class: alb # aws load balancer controller ingressClass name
      # additional aws alb ingress controller supported annotations
      # ...
    # replace with your actual domain
    host: sourcegraph.company.com

storageClass:
  create: true
  type: gp2 # This configures SSDs (recommended).
  provisioner: ebs.csi.aws.com
  volumeBindingMode: WaitForFirstConsumer
  reclaimPolicy: Retain
```

Install the chart

```sh
helm upgrade --install --values ./override.yaml --version 0.7.0 sourcegraph sourcegraph/sourcegraph
```

It will take some time for the load balancer to be fully ready, you may check on the status and obtain the load balancer address:

```sh
kubectl describe ingress sourcegraph-frontend
```

Upon obtaining the allocated address of the load balancer, you should create a DNS record for the `sourcegraph.company.com` domain that resolves to the load balancer address.

It is recommended to enable TLS and configure certificate properly on your load balancer. You may consider using [AWS-managed certificate](https://docs.aws.amazon.com/acm/latest/userguide/acm-overview.html) and add the following annotations to Ingress.

```yaml
frontend:
  ingress:
    annotations:
      kubernetes.io/ingress.class: alb
      # ARN of the AWS-managed TLS certificate
      alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:us-west-2:xxxxx:certificate/xxxxxxx
```

#### References

- [Enable TLS with AWS-managed certificate](https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/annotations/#ssl)
- [Supported AWS load balancer annotations](https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/annotations)

### Configure Sourcegraph on Azure Managed Kubernetes Service (AKS)

#### Prerequisites

You need to have a AKS cluster (>=1.19) with the following addons enabled:

> You may consider using your custom Ingress Controller instead of Application Gateway, [learn more](https://docs.microsoft.com/en-us/azure/aks/ingress-basic)

- [x] [Azure Application Gateway Ingress Controller](https://docs.microsoft.com/en-us/azure/application-gateway/ingress-controller-install-new)
- [x] [Azure Disk CSI driver](https://docs.microsoft.com/en-us/azure/aks/csi-storage-drivers)

Your account should have sufficient access equivalent to the `cluster-admin` ClusterRole.

#### Steps

Create an override file with the following values. We configure Ingress to use [Application Gateway](https://azure.microsoft.com/en-us/services/application-gateway) to expose Sourcegraph publicly on a domain of your choosing and Storage Class to use [Azure Disk CSI driver](https://docs.microsoft.com/en-us/azure/aks/azure-disk-csi).

[override.yaml](https://github.com/sourcegraph/deploy-sourcegraph-helm/tree/main/charts/sourcegraph/examples/azure/override.yaml)
```yaml
frontend:
  ingress:
    enabled: true
    annotations:
      kubernetes.io/ingress.class: azure/application-gateway
      # additional azure application gateway supported annotations
      # ...
    # replace with your actual domain
    host: sourcegraph.company.com

storageClass:
  create: true
  type: null
  provisioner: disk.csi.azure.com
  volumeBindingMode: WaitForFirstConsumer
  reclaimPolicy: Retain
  parameters:
    storageaccounttype: Premium_LRS # This configures SSDs (recommended). A Premium VM is required.
```

Install the chart

```sh
helm upgrade --install --values ./override.yaml --version 0.7.0 sourcegraph sourcegraph/sourcegraph
```

It will take some time for the load balancer to be fully ready, you may check on the status and obtain the load balancer address:

```sh
kubectl describe ingress sourcegraph-frontend
```

Upon obtaining the allocated address of the load balancer, you should create a DNS record for the `sourcegraph.company.com` domain that resolves to the load balancer address.

It is recommended to enable TLS and configure certificate properly on your load balancer. You may consider using an [Azure-managed certificate](https://azure.github.io/application-gateway-kubernetes-ingress/features/appgw-ssl-certificate/) and add the following annotations to Ingress.

```yaml
frontend:
  ingress:
    annotations:
      kubernetes.io/ingress.class: azure/application-gateway
      # Name of the Azure-managed TLS certificate
      appgw.ingress.kubernetes.io/appgw-ssl-certificate: azure-key-vault-managed-ssl-cert
```

#### References

- [Expose an AKS service over HTTP or HTTPS using Application Gateway](https://docs.microsoft.com/en-us/azure/application-gateway/ingress-controller-expose-service-over-http-https)
- [Supported Azure Application Gateway Ingress Controller annotations](https://azure.github.io/application-gateway-kubernetes-ingress/annotations/)
- [What is Application Gateway Ingress Controller?](https://docs.microsoft.com/en-us/azure/application-gateway/ingress-controller-overview)


### Configure Sourcegraph on other Cloud providers or on-prem

#### Prerequisites

You need to have a Kubernetes cluster (>=1.19) with the following components installed:

- [x] Ingress Controller, e.g. Cloud providers-native solution, [NGINX Ingress Controller]
- [x] Block Storage CSI driver

Your account should have sufficient access equivalent to the `cluster-admin` ClusterRole.

#### Steps

Read <https://kubernetes.io/docs/concepts/storage/storage-classes/> to configure the `storageClass.provisioner` and `storageClass.parameters` fields for your cloud provider or consult documentation of the storage solution in your on-prem environment.

```yaml
frontend:
  ingress:
    enabled: true
    annotations:
      kubernetes.io/ingress.class: ingress-class-name # replace with actual ingress class name
      # additional ingress controller supported annotations
      # ...
    # replace with your actual domain
    host: sourcegraph.company.com

storageClass:
  create: true
  provisioner: <REPLACE_ME>
  volumeBindingMode: WaitForFirstConsumer
  reclaimPolicy: Retain
  parameters:
    key1: value1
```

Install the chart

```sh
helm upgrade --install --values ./override.yaml --version 0.7.0 sourcegraph sourcegraph/sourcegraph
```

Depending how your Ingress Controller work, you may be able to check on status and obtain the public address of your Ingress.

```sh
kubectl describe ingress sourcegraph-frontend
```

You should create a DNS record for the `sourcegraph.company.com` domain that resolves to the Ingress public address.

It is recommended to enable TLS and configure certificate properly on your Ingress. You may utilize managed certificate solution provided by Cloud providers. 

Alternatively, you may consider configuring [cert-manager with Let's Encrypt](https://cert-manager.io/docs/configuration/acme/) in your cluster and add the following override to Ingress.

```yaml
frontend:
  ingress:
    enabled: true
    annotations:
      kubernetes.io/ingress.class: ingress-class-name # replace with actual ingress class name
      # additional ingress controller supported annotations
      # ...
      # cert-managed annotations
      cert-manager.io/cluster-issuer: letsencrypt # replace with actual cluster-issuer name
    tlsSecret: sourcegraph-frontend-tls # cert-manager will store the created certificate in this secret.
    # replace with your actual domain
    host: sourcegraph.company.com
```

You also have the option to manually configure TLS certificate via [TLS Secrets](https://kubernetes.io/docs/concepts/configuration/secret/#tls-secrets).

`sourcegraph-frontend-tls.Secret.yaml`
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: sourcegraph-frontend-tls
type: kubernetes.io/tls
data:
  # the data is abbreviated in this example
  tls.crt: |
    MIIC2DCCAcCgAwIBAgIBATANBgkqh ...
  tls.key: |
    MIIEpgIBAAKCAQEA7yn3bRHQ5FHMQ ...
```

```sh
kubectl apply -f ./sourcegraph-frontend-tls.Secret.yaml
```

Add the following values to your override file.

```yaml
frontend:
  ingress:
    enabled: true
    annotations:
      kubernetes.io/ingress.class: ingress-class-name # replace with actual ingress class name
      # additional ingress controller supported annotations
      # ...
    tlsSecret: sourcegraph-frontend-tls # reference the created TLS Secret
    # replace with your actual domain
    host: sourcegraph.company.com
```

## Advanced configuration

### Integrate Kustomize with Helm chart

The Helm chart is new and still under active development, and we may not cover all of your use cases. 

Please contact [support@sourcegraph.com](mailto:support@sourcegraph.com) or your Customer Engineer directly to discuss your specific need.

For advanced users who are looking for a temporary workaround, we __recommend__ applying [Kustomize](https://kustomize.io) on the rendered manifests from our chart. Please __do not__ maintain your own fork of our chart, this may impact our ability to support you if you run into issues.

You can learn more about how to integrate Kustomize with Helm from our [example](https://github.com/sourcegraph/deploy-sourcegraph-helm/tree/main/charts/sourcegraph/examples/kustomize-chart).

### Sub-chart

__TODO__

## Upgrading Sourcegraph

A new version of Sourcegraph is released every month (with patch releases in between, released as needed). Check the [Sourcegraph blog](https://about.sourcegraph.com/blog) for release announcements.

> WARNING: Skipping minor version upgrades of Sourcegraph is not supported. You must upgrade one minor version at a time - e.g. v3.26 –> v3.27 –> v3.28.

### Upgrading

1. Review [Helm Changelog] and [Sourcegraph Changelog] and select a helm chart version compatible with your current Sourcegraph version. You can only upgrade one minor version of Sourcegraph at a time.

1. Update the repo list of charts to retrieve the updated list of versions:

   ```bash
      helm repo update sourcegraph
   ```

1. (Optional) Review the changes that will be applied - see [Reviewing Changes](#reviewing-changes) for options.

1.  Install the new version:

   ```bash
      helm upgrade --install --wait -f override.yaml --version 0.7.0 sourcegraph sourcegraph/sourcegraph
   ```

The --wait flag is optional and can be removed if you do not want to wait for the upgraded resources to become healthy.

### Rollback

You can revert to a previous version with the following command:

   ```bash
      helm rollback sourcegraph
   ```

Sourcegraph only supports rolling back one minor version, due to database compatibility guarantees.

### Database Migrations

By default, database migrations will be performed during application startup by a `migrator` init container running prior to the `frontend` deployment. These migrations **must** succeed before Sourcegraph will become available. If the databases are large, these migrations may take a long time.

In some situations, administrators may wish to migrate their databases before upgrading the rest of the system to reduce downtime. Sourcegraph guarantees database backward compatibility to the most recent minor point release so the database can safely be upgraded before the application code.

To execute the database migrations independently, you can use the [Sourcegraph Migrator] helm chart.

## Reviewing Changes

When configuring an override file or performing an upgrade, we recommend reviewing the changes before applying them.

### Using helm template

The helm template command can be used to render manifests for review and comparison. This is particularly useful to confirm the effect of changes to your override file. This approach does not require access to the Kubernetes server.

For example:

1. Render the initial manifests from your existing deployment setup to an output file:

   ```bash
      CHART_VERSION=0.6.0 # Currently deployed version
      helm template sourcegraph -f override.yaml --version $CHART_VERSION sourcegraph sourcegraph/sourcegraph > original_manifests
   ```

1. Make changes to your override file, and/or update the chart version, then render that output:

   ```bash
      CHART_VERSION=0.7.0 # Not yet deployed version
      helm template sourcegraph -f override.yaml --version $CHART_VERSION sourcegraph sourcegraph/sourcegraph > new_manifests
   ```

1. Compare the two outputs:

   ```bash
      diff original_manifests new_manifests
   ```

### Using helm upgrade --dry-run

Similar to `helm template`, the `helm upgrade --dry-run` command can be used to render manifests for review and comparison. This requires access to the Kubernetes server, but has the benefit of validating the Kubernetes manifests.

The following command will render and validate the manifests:

   ```bash
      helm upgrade --install --dry-run -f override.yaml sourcegraph sourcegraph/sourcegraph
   ```

Any validation errors will be displayed instead of the rendered manifests.

If you are having difficulty tracking down the cause of an issue, add the `--debug` flag to enable verbose logging:

   ```bash
      helm upgrade --install --dry-run --debug -f override.yaml sourcegraph sourcegraph/sourcegraph
   ```

The `--debug` flag will enable verbose logging and additional context, including the computed values used by the chart. This is useful when confirming your overrides have been interpreted correctly.

### Using Helm Diff plugin

The [Helm Diff] plugin can provide a diff against a deployed chart. It is similar to the `helm upgrade --dry-run` option, but can run against the live deployment. This requires access to the Kubernetes server.

To install the plugin, run:

   ```bash
      helm plugin install https://github.com/databus23/helm-diff
   ```

Then, display a diff between a live deployment and an upgrade, with 5 lines of context:

   ```bash
      helm diff upgrade -f override.yaml sourcegraph sourcegraph/sourcegraph -C 5
   ```

For more examples and configuration options, reference the [Helm Diff] plugin documentation.

[backendconfig]: https://cloud.google.com/kubernetes-engine/docs/how-to/ingress-features#create_backendconfig
[azure application gateway]: https://docs.microsoft.com/en-us/azure/application-gateway/overview
[Container-native load balancing]: https://cloud.google.com/kubernetes-engine/docs/how-to/container-native-load-balancing
[Compute Engine persistent disk]: https://cloud.google.com/kubernetes-engine/docs/how-to/persistent-volumes/gce-pd-csi-driver
[AWS Load Balancer Controller]: https://docs.aws.amazon.com/eks/latest/userguide/aws-load-balancer-controller.html
[AWS EBS CSI driver]: https://docs.aws.amazon.com/eks/latest/userguide/managing-ebs-csi.html
[NGINX Ingress Controller]: https://github.com/kubernetes/ingress-nginx
[Helm Changelog]: https://github.com/sourcegraph/deploy-sourcegraph-helm/blob/main/charts/sourcegraph/CHANGELOG.md
[Sourcegraph Changelog]: https://github.com/sourcegraph/sourcegraph/blob/main/CHANGELOG.md
[Sourcegraph Migrator]: https://github.com/sourcegraph/deploy-sourcegraph-helm/blob/main/charts/sourcegraph-migrator
[Helm Diff]: https://github.com/databus23/helm-diff