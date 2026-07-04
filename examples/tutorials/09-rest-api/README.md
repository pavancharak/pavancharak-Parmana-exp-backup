\# Tutorial 09 — REST API



\## Overview



This tutorial demonstrates how to interact with Parmana through its REST API.



Instead of calling the Runtime directly, a client submits a Business Transaction over HTTP. The API executes the transaction and returns the resulting Execution Trust Record.



\---



\## Learning Objectives



After completing this tutorial you will understand:



\- Parmana REST API

\- HTTP Requests

\- Business Transaction Submission

\- Execution Trust Record Response



\---



\## Files



| File | Purpose |

|------|---------|

| `request.json` | Business Transaction submitted to the API |

| `run.ts` | Sends an HTTP request to the Parmana API |



\---



\## Architecture



```

Client

&#x20;  │

&#x20;  ▼

REST API

&#x20;  │

&#x20;  ▼

Runtime

&#x20;  │

&#x20;  ▼

Policy Engine

&#x20;  │

&#x20;  ▼

Execution Trust Record

```



\---



\## Run



```bash

npm run example -- 09-rest-api

```



or



```bash

tsx run.ts

```



\---



\## Expected Output



The tutorial prints:



\- HTTP Request

\- HTTP Response

\- Execution Trust Record



\---



\## Next Tutorial



Continue to \*\*Tutorial 10 – End-to-End\*\*.

