#!/usr/bin/env bash
# Launch GLM-4.7 (355B, BF16) on 8x Gaudi 3 via vllm-gaudi
# Usage: HF_TOKEN=hf_xxx ./launch-glm47.sh

set -euo pipefail

: "${HF_TOKEN:?Set HF_TOKEN before running this script}"

CONTAINER_NAME="vllm-glm47"
HF_CACHE="/mnt/data/huggingface"
MODEL="zai-org/GLM-4.7"
TP=8
PORT=8000
MAX_MODEL_LEN=8192

# Stop existing container if running
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

echo "Launching $MODEL with TP=$TP on port $PORT..."
echo "HF cache: $HF_CACHE"
echo "This will take ~15-20 min on first run (download + warmup)"

docker run -d --name "$CONTAINER_NAME" \
  --runtime=habana \
  -e HABANA_VISIBLE_DEVICES=all \
  -e OMPI_MCA_btl_vader_single_copy_mechanism=none \
  -e HF_TOKEN="$HF_TOKEN" \
  -e HF_HOME="$HF_CACHE" \
  --cap-add=SYS_NICE \
  --ipc=host \
  -p "$PORT:$PORT" \
  -v "$HF_CACHE:$HF_CACHE" \
  --entrypoint bash \
  vllm-gaudi:latest \
  -c "pip install --upgrade transformers && exec vllm serve $MODEL \
    --tensor-parallel-size $TP \
    --dtype bfloat16 \
    --max-model-len $MAX_MODEL_LEN \
    --port $PORT"

echo ""
echo "Container started. Monitor with:"
echo "  docker logs -f $CONTAINER_NAME"
echo ""
echo "Test when ready:"
echo "  curl http://localhost:$PORT/v1/models"
