#!/bin/bash
curl -X POST http://localhost:3040/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Hello! What is 2+2?"
      }
    ]
  }'
