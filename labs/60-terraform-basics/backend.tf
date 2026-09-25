# Remote state in Cloud Storage. This is a partial configuration: step 4
# passes the bucket name with -backend-config, so no project ID is in the code.
terraform {
  backend "gcs" {
    prefix = "lab60/state"
  }
}
