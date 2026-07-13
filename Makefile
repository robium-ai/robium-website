.PHONY: dev build smoke docker-build docker-smoke image deploy

dev:
	npm run dev

build:
	npm run build

smoke: build
	bash tests/smoke.sh

# --- container ---
docker-build:
	docker build -t robium-site:local .

docker-smoke: docker-build
	docker rm -f robium-site-smoke 2>/dev/null || true
	docker run -d --name robium-site-smoke -p 8080:8080 robium-site:local
	sleep 2
	bash tests/smoke.sh http://localhost:8080 ; RC=$$? ; \
	docker rm -f robium-site-smoke >/dev/null ; exit $$RC

# --- GCP ---
PROJECT ?= robium-prod
REGION  ?= us-central1
IMAGE   = $(REGION)-docker.pkg.dev/$(PROJECT)/robium/site:latest

image:
	gcloud builds submit --project=$(PROJECT) --config=cloudbuild.yaml .

deploy:
	gcloud run deploy robium-site --image=$(IMAGE) \
	  --region=$(REGION) --project=$(PROJECT) --platform=managed \
	  --allow-unauthenticated --min-instances=0 --max-instances=2 --quiet

orchestrator:
	cd demo-orchestrator && npm run start
