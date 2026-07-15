# robium-website

Landing page (served at **robium.ai**) for the [robium](https://github.com/jazarium/robium-plugin) Claude Code
plugin. Astro 6 static site, Dark/Aurora theme, zero client-side JS. All
content is real: the hero terminal is a condensed transcript from an actual
build, the skill grid is generated from the repo at build time, and the proof
section shows a real policy-evaluation rollout.

## Develop

    npm install
    make dev        # local dev server
    make smoke      # build + content assertions (the done bar)

The skill catalog regenerates on every build from `~/repos/robium-plugin` (override
with `ROBIUM_DIR=...`), falling back to the GitHub API, then to the committed
`src/data/skills.json`.

## Deploy (GCP)

One-time setup:

    gcloud projects create robium-prod
    gcloud billing projects link robium-prod --billing-account=<ACCOUNT_ID>
    gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
      artifactregistry.googleapis.com --project=robium-prod
    gcloud artifacts repositories create robium --repository-format=docker \
      --location=us-central1 --project=robium-prod

Each deploy:

    make image      # Cloud Build → Artifact Registry
    make deploy     # → Cloud Run service robium-site

Domain (one-time): map robium.ai + www in Cloud Run → Domain mappings, then
add the printed DNS records at the registrar. TLS is managed automatically.
robium.ai is canonical; robium.org and robium.dev (+ www) are mapped to the
same service and 301-redirect to robium.ai in nginx.conf.

## Launch checklist

- [ ] `jazarium/robium-plugin` repo public (install command + CI catalog fetch)
- [ ] `make smoke` green locally and `tests/smoke.sh https://robium.ai` green
- [ ] Foxglove capture added to the nav-trial card (v1 ships the smoke
      transcript; swap in the image when captured)
