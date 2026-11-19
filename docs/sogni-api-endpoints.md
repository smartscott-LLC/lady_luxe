#### [Production Integrations](https://docs.sogni.ai/api-reference/production-integrations/)

Billing, limits, connection rules, and architecture for teams running Sogni in production.

* [GET/v1/creative-agent/workflows/:id](https://docs.sogni.ai/api-reference/production-integrations/#serverless-pattern)

### Generation

#### [Generation Recipes](https://docs.sogni.ai/api-reference/direct-generation/)

Single-step image, video, image-to-video, and music workflows.

* [POST/v1/creative-agent/workflows](https://docs.sogni.ai/api-reference/direct-generation/#direct-generation-image)

#### [Project Status API](https://docs.sogni.ai/api-reference/project-status/)

Owner-authenticated project status, pending and terminal states, polling, and 24-hour failed/canceled retention.

* [GET/v2/projects/:id](https://docs.sogni.ai/api-reference/project-status/#project-status-api)

#### [Media Utilities, 3D and Speech](https://docs.sogni.ai/api-reference/media-utilities/)

Background removal, object selection, multi-view 3D reconstruction, video upscaling, speech and voice cloning, and audio-driven or two-stage MiniMax H3 video.

* [POST/v1/creative-agent/workflows](https://docs.sogni.ai/api-reference/media-utilities/#media-utilities-3d-and-speech)  
* [POST/v1/creative-agent/tools/execute](https://docs.sogni.ai/api-reference/media-utilities/#media-utilities-3d-and-speech)

#### [Personal LoRAs](https://docs.sogni.ai/api-reference/personal-loras/)

Import LoRA files into your account library, check import status, and use ready adapters in compatible renders.

* [GET/v1/loras/personal](https://docs.sogni.ai/api-reference/personal-loras/#endpoints)  
* [GET/v1/loras/personal/:id](https://docs.sogni.ai/api-reference/personal-loras/#endpoints)  
* [GET/v1/loras/personal/catalog](https://docs.sogni.ai/api-reference/personal-loras/#endpoints)  
* [POST/v1/loras/personal](https://docs.sogni.ai/api-reference/personal-loras/#endpoints)  
* [DELETE/v1/loras/personal/:id](https://docs.sogni.ai/api-reference/personal-loras/#endpoints)  
* [GET/v1/loras/comfy](https://docs.sogni.ai/api-reference/personal-loras/#sdk)

### Chat and agents

#### [Chat Completions](https://docs.sogni.ai/api-reference/chat-completions/)

OpenAI-compatible chat, tool execution, and streaming responses.

* [POST/v1/chat/completions](https://docs.sogni.ai/api-reference/chat-completions/#endpoint-post-v1-chat-completions)

#### [Direct Tool Execution](https://docs.sogni.ai/api-reference/tool-execution/)

Execute synchronous creative tools with explicit arguments.

* [POST/v1/creative-agent/tools/execute](https://docs.sogni.ai/api-reference/tool-execution/#endpoint-post-v1-creative-agent-tools-execute)

#### [LLM Models](https://docs.sogni.ai/api-reference/llm-models/)

Discover the OpenAI-compatible chat model listing.

* [GET/v1/models](https://docs.sogni.ai/api-reference/llm-models/#endpoint-get-v1-models)  
* [GET/v1/models/:model\_id](https://docs.sogni.ai/api-reference/llm-models/#endpoint-get-v1-models-model-id)

#### [Durable Chat Runs](https://docs.sogni.ai/api-reference/chat-runs/)

Create, inspect, stream, cancel, and confirm costs for durable chat runs.

* [POST/v1/chat/runs](https://docs.sogni.ai/api-reference/chat-runs/#endpoint-post-v1-chat-runs)  
* [GET/v1/chat/runs/:id](https://docs.sogni.ai/api-reference/chat-runs/#chat-runs-get)  
* [GET/v1/chat/runs/:id/events](https://docs.sogni.ai/api-reference/chat-runs/#chat-runs-events)  
* [GET/v1/chat/runs/:id/events/stream](https://docs.sogni.ai/api-reference/chat-runs/#chat-runs-stream)  
* [POST/v1/chat/runs/:id/cancel](https://docs.sogni.ai/api-reference/chat-runs/#chat-runs-cancel)  
* [POST/v1/chat/runs/:id/confirm-cost](https://docs.sogni.ai/api-reference/chat-runs/#chat-runs-confirm-cost)

#### [Creative Workflows](https://docs.sogni.ai/api-reference/workflows/)

Create and manage persisted multi-step creative workflows.

* [POST/v1/creative-agent/workflows](https://docs.sogni.ai/api-reference/workflows/#endpoint-post-v1-creative-agent-workflows)  
* [GET/v1/creative-agent/workflows](https://docs.sogni.ai/api-reference/workflows/#workflows-list)  
* [GET/v1/creative-agent/workflows/:id](https://docs.sogni.ai/api-reference/workflows/#workflows-get)  
* [GET/v1/creative-agent/workflows/:id/events](https://docs.sogni.ai/api-reference/workflows/#workflows-events)  
* [GET/v1/creative-agent/workflows/:id/events/stream](https://docs.sogni.ai/api-reference/workflows/#workflows-stream)  
* [POST/v1/creative-agent/workflows/:id/resume](https://docs.sogni.ai/api-reference/workflows/#workflows-resume)  
* [POST/v1/creative-agent/workflows/:id/confirm-cost](https://docs.sogni.ai/api-reference/workflows/#workflows-confirm-cost)  
* [POST/v1/creative-agent/workflows/:id/cancel](https://docs.sogni.ai/api-reference/workflows/#workflows-cancel)  
* [POST/v1/creative-agent/workflows/:id/reseed](https://docs.sogni.ai/api-reference/workflows/#workflows-reseed)

#### [Workflow Templates](https://docs.sogni.ai/api-reference/templates/)

Create, list, update, delete, and fork reusable workflow templates.

* [POST/v1/creative-agent/workflows/templates](https://docs.sogni.ai/api-reference/templates/#endpoint-post-v1-creative-agent-workflows-templates)  
* [GET/v1/creative-agent/workflows/templates](https://docs.sogni.ai/api-reference/templates/#templates-list)  
* [GET/v1/creative-agent/workflows/templates/:id](https://docs.sogni.ai/api-reference/templates/#templates-get)  
* [PATCH/v1/creative-agent/workflows/templates/:id](https://docs.sogni.ai/api-reference/templates/#templates-update)  
* [DELETE/v1/creative-agent/workflows/templates/:id](https://docs.sogni.ai/api-reference/templates/#templates-delete)  
* [POST/v1/creative-agent/workflows/templates/:id/fork](https://docs.sogni.ai/api-reference/templates/#templates-fork)

#### [Replay Records](https://docs.sogni.ai/api-reference/replay/)

Ingest and retrieve replay records for integration debugging.

* [POST/v1/replay/records](https://docs.sogni.ai/api-reference/replay/#endpoint-post-v1-replay-records)  
* [GET/v1/replay/records](https://docs.sogni.ai/api-reference/replay/#replay-list)  
* [GET/v1/replay/records/:id](https://docs.sogni.ai/api-reference/replay/#replay-get)

### Media and accounts

#### [Media and Image URLs](https://docs.sogni.ai/api-reference/media/)

Request signed upload and download URLs for reference assets and results, and manage reusable saved uploads.

* [GET/v1/media/uploadUrl](https://docs.sogni.ai/api-reference/media/#endpoint-get-v1-media-uploadurl)  
* [GET/v1/media/downloadUrl](https://docs.sogni.ai/api-reference/media/#media-download)  
* [GET/v1/image/uploadUrl](https://docs.sogni.ai/api-reference/media/#endpoint-get-v1-image-uploadurl)  
* [GET/v1/image/downloadUrl](https://docs.sogni.ai/api-reference/media/#images-download)  
* [GET/v2/media/uploadUrl](https://docs.sogni.ai/api-reference/media/#media-form-upload)  
* [GET/v2/image/uploadUrl](https://docs.sogni.ai/api-reference/media/#images-form-upload)  
* [GET/v2/media/downloadUrl](https://docs.sogni.ai/api-reference/media/#media-download-v2)  
* [GET/v2/image/downloadUrl](https://docs.sogni.ai/api-reference/media/#images-download-v2)  
* [GET/v1/assets](https://docs.sogni.ai/api-reference/media/#saved-uploads-list)  
* [GET/v1/assets/capabilities](https://docs.sogni.ai/api-reference/media/#saved-uploads-capabilities)  
* [POST/v1/assets/prepare](https://docs.sogni.ai/api-reference/media/#saved-uploads-prepare)  
* [POST/v1/assets/:id/finalize](https://docs.sogni.ai/api-reference/media/#saved-uploads-finalize)  
* [POST/v1/assets/:id/bind](https://docs.sogni.ai/api-reference/media/#saved-uploads-bind)  
* [DELETE/v1/assets/:id](https://docs.sogni.ai/api-reference/media/#saved-uploads-delete)

#### [On-chain Wallet](https://docs.sogni.ai/api-reference/wallet/)

Public blockchain wallet balances, network RPC endpoints, and token contract addresses.

* [GET/v2/wallet/balance](https://docs.sogni.ai/api-reference/wallet/#endpoint-get-v2-wallet-balance)  
* [GET/v1/wallet/rpc-endpoints](https://docs.sogni.ai/api-reference/wallet/#wallet-rpc)  
* [GET/v1/contract/addresses](https://docs.sogni.ai/api-reference/wallet/#wallet-contract-addresses)

#### [Balances and Usage](https://docs.sogni.ai/api-reference/account-and-usage/)

Private generation-account balances, subscription status, usage, and worker earnings.

* [GET/v2/account/me](https://docs.sogni.ai/api-reference/account-and-usage/#account-identity)  
* [GET/v4/account/balance](https://docs.sogni.ai/api-reference/account-and-usage/#generation-account-balance)  
* [GET/v1/subscriptions/status](https://docs.sogni.ai/api-reference/account-and-usage/#subscription-status)  
* [GET/v1/subscriptions/usage](https://docs.sogni.ai/api-reference/account-and-usage/#usage-and-fair-use-state)  
* [GET/v1/subscriptions/usage/history](https://docs.sogni.ai/api-reference/account-and-usage/#usage-and-fair-use-state)  
* [GET/v1/subscriptions/worker/earnings](https://docs.sogni.ai/api-reference/account-and-usage/#worker-subscription-pool-earnings)  
* [GET/v1/subscriptions/plans](https://docs.sogni.ai/api-reference/account-and-usage/#polling-guidance)

### Network

#### [Worker Analytics](https://docs.sogni.ai/api-reference/worker-analytics/)

Public aggregate worker activity, bounded historical charts, and batched NFT analytics.

* [GET/v1/analytics/day](https://docs.sogni.ai/api-reference/worker-analytics/#daily-totals-and-batched-worker-reads)  
* [GET/v1/analytics/lifetime](https://docs.sogni.ai/api-reference/worker-analytics/#daily-totals-and-batched-worker-reads)  
* [GET/v1/analytics/day/nft/:nftTokenId](https://docs.sogni.ai/api-reference/worker-analytics/#daily-totals-and-batched-worker-reads)  
* [GET/v1/analytics/lifetime/nft/:nftTokenId](https://docs.sogni.ai/api-reference/worker-analytics/#daily-totals-and-batched-worker-reads)  
* [GET/v1/analytics/day/nfts](https://docs.sogni.ai/api-reference/worker-analytics/#daily-totals-and-batched-worker-reads)  
* [GET/v1/analytics/chart/daily/events/query](https://docs.sogni.ai/api-reference/worker-analytics/#daily-event-charts)  
* [GET/v1/analytics/chart/daily/model-use/query](https://docs.sogni.ai/api-reference/worker-analytics/#per-model-activity)  
* [GET/v1/analytics/model-use/lifetime](https://docs.sogni.ai/api-reference/worker-analytics/#per-model-activity)  
* [GET/v1/model-renders/user-stats](https://docs.sogni.ai/api-reference/worker-analytics/#per-model-activity)

#### [Models and Network Demand](https://docs.sogni.ai/api-reference/model-discovery/)

Public generation model catalogs, live worker supply and demand, and worker releases.

* [GET/v1/model-catalog](https://docs.sogni.ai/api-reference/model-discovery/#model-catalog)  
* [GET/v1/model-catalog/:modelId](https://docs.sogni.ai/api-reference/model-discovery/#model-catalog)  
* [GET/v1/model-demand](https://docs.sogni.ai/api-reference/model-discovery/#live-model-supply-and-demand)  
* [GET/v1/model-gallery](https://docs.sogni.ai/api-reference/model-discovery/#model-sample-gallery)  
* [GET/v1/model-gallery/:modelId](https://docs.sogni.ai/api-reference/model-discovery/#model-sample-gallery)  
* [GET/v1/worker/releases](https://docs.sogni.ai/api-reference/model-discovery/#worker-releases)  
* [GET/v1/worker-images/comfy](https://docs.sogni.ai/api-reference/model-discovery/#worker-releases)  
* [GET/v1/worker-images/comfy-spark](https://docs.sogni.ai/api-reference/model-discovery/#worker-releases)  
* [GET/v1/worker-images/llm](https://docs.sogni.ai/api-reference/model-discovery/#worker-releases)

### Resources

#### [SDKs and Resources](https://docs.sogni.ai/api-reference/sdks/)

SDKs, client libraries, and related integration guides.

#### [Changelog](https://docs.sogni.ai/api-reference/changelog/)

Public record of what changed on Sogni for artists, developers and worker operators, with filters, cursor paging, conditional requests, and JSON Feed and Atom feeds.

* [GET/v1/changelog](https://docs.sogni.ai/api-reference/changelog/#list-entries)  
* [GET/v1/changelog/:id](https://docs.sogni.ai/api-reference/changelog/#one-entry)  
* [GET/v1/changelog/products](https://docs.sogni.ai/api-reference/changelog/#products)  
* [GET/v1/changelog/feed.json](https://docs.sogni.ai/api-reference/changelog/#feeds)  
* [GET/v1/changelog/feed.atom](https://docs.sogni.ai/api-reference/changelog/#feeds)

Previously shared section links  
Existing bookmarks still work. Each section now has a focused reference page.

* [Getting Started: introduction](https://docs.sogni.ai/api-reference/getting-started/#introduction)  
* [Getting Started: authentication](https://docs.sogni.ai/api-reference/getting-started/#authentication)  
* [Getting Started: versioning](https://docs.sogni.ai/api-reference/getting-started/#versioning)  
* [Getting Started: errors](https://docs.sogni.ai/api-reference/getting-started/#errors)  
* [Getting Started: rate-limits](https://docs.sogni.ai/api-reference/getting-started/#rate-limits)  
* [Getting Started: idempotency](https://docs.sogni.ai/api-reference/getting-started/#idempotency)  
* [Getting Started: billing](https://docs.sogni.ai/api-reference/getting-started/#billing)  
* [Generation Recipes: direct-generation](https://docs.sogni.ai/api-reference/direct-generation/#direct-generation)  
* [Generation Recipes: direct-generation-image](https://docs.sogni.ai/api-reference/direct-generation/#direct-generation-image)  
* [Generation Recipes: direct-generation-video](https://docs.sogni.ai/api-reference/direct-generation/#direct-generation-video)  
* [Generation Recipes: direct-generation-image-to-video](https://docs.sogni.ai/api-reference/direct-generation/#direct-generation-image-to-video)  
* [Generation Recipes: direct-generation-music](https://docs.sogni.ai/api-reference/direct-generation/#direct-generation-music)  
* [Chat Completions: chat-completions](https://docs.sogni.ai/api-reference/chat-completions/#chat-completions)  
* [Direct Tool Execution: creative-agent-tools-execute](https://docs.sogni.ai/api-reference/tool-execution/#creative-agent-tools-execute)  
* [LLM Models: models](https://docs.sogni.ai/api-reference/llm-models/#models)  
* [Durable Chat Runs: chat-runs](https://docs.sogni.ai/api-reference/chat-runs/#chat-runs)  
* [Durable Chat Runs: chat-runs-get](https://docs.sogni.ai/api-reference/chat-runs/#chat-runs-get)  
* [Durable Chat Runs: chat-runs-events](https://docs.sogni.ai/api-reference/chat-runs/#chat-runs-events)  
* [Durable Chat Runs: chat-runs-stream](https://docs.sogni.ai/api-reference/chat-runs/#chat-runs-stream)  
* [Durable Chat Runs: chat-runs-cancel](https://docs.sogni.ai/api-reference/chat-runs/#chat-runs-cancel)  
* [Durable Chat Runs: chat-runs-confirm-cost](https://docs.sogni.ai/api-reference/chat-runs/#chat-runs-confirm-cost)  
* [Creative Workflows: workflows](https://docs.sogni.ai/api-reference/workflows/#workflows)  
* [Creative Workflows: workflows-list](https://docs.sogni.ai/api-reference/workflows/#workflows-list)  
* [Creative Workflows: workflows-get](https://docs.sogni.ai/api-reference/workflows/#workflows-get)  
* [Creative Workflows: workflows-events](https://docs.sogni.ai/api-reference/workflows/#workflows-events)  
* [Creative Workflows: workflows-stream](https://docs.sogni.ai/api-reference/workflows/#workflows-stream)  
* [Creative Workflows: workflows-resume](https://docs.sogni.ai/api-reference/workflows/#workflows-resume)  
* [Creative Workflows: workflows-confirm-cost](https://docs.sogni.ai/api-reference/workflows/#workflows-confirm-cost)  
* [Creative Workflows: workflows-cancel](https://docs.sogni.ai/api-reference/workflows/#workflows-cancel)  
* [Creative Workflows: workflows-reseed](https://docs.sogni.ai/api-reference/workflows/#workflows-reseed)  
* [Workflow Templates: templates](https://docs.sogni.ai/api-reference/templates/#templates)  
* [Workflow Templates: templates-list](https://docs.sogni.ai/api-reference/templates/#templates-list)  
* [Workflow Templates: templates-get](https://docs.sogni.ai/api-reference/templates/#templates-get)  
* [Workflow Templates: templates-update](https://docs.sogni.ai/api-reference/templates/#templates-update)  
* [Workflow Templates: templates-delete](https://docs.sogni.ai/api-reference/templates/#templates-delete)  
* [Workflow Templates: templates-fork](https://docs.sogni.ai/api-reference/templates/#templates-fork)  
* [Media and Image URLs: media](https://docs.sogni.ai/api-reference/media/#media)  
* [Media and Image URLs: media-download](https://docs.sogni.ai/api-reference/media/#media-download)  
* [Media and Image URLs: images](https://docs.sogni.ai/api-reference/media/#images)  
* [Media and Image URLs: images-download](https://docs.sogni.ai/api-reference/media/#images-download)  
* [On-chain Wallet: wallet](https://docs.sogni.ai/api-reference/wallet/#wallet)  
* [On-chain Wallet: wallet-rpc](https://docs.sogni.ai/api-reference/wallet/#wallet-rpc)  
* [Replay Records: replay](https://docs.sogni.ai/api-reference/replay/#replay)  
* [Replay Records: replay-list](https://docs.sogni.ai/api-reference/replay/#replay-list)  
* [Replay Records: replay-get](https://docs.sogni.ai/api-reference/replay/#replay-get)  
* [SDKs and Resources: sdks](https://docs.sogni.ai/api-reference/sdks/#sdks)