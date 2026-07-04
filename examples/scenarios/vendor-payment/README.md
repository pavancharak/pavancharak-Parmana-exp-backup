# \# Scenario — Vendor Payment

# 

# \## Overview

# 

# This scenario demonstrates a complete vendor payment approval workflow using Parmana.

# 

# A vendor payment is authorized by a human authority, evaluated against the Vendor Payment Policy, executed by the Runtime, verified, and finally issued a cryptographic Receipt.

# 

# This scenario represents a realistic enterprise finance workflow.

# 

# \---

# 

# \## Business Flow

# 

# Vendor submits invoice

# 

# ↓

# 

# Finance reviews invoice

# 

# ↓

# 

# Human authority approves payment

# 

# ↓

# 

# Parmana evaluates policy

# 

# ↓

# 

# Runtime executes transaction

# 

# ↓

# 

# Execution Trust Record created

# 

# ↓

# 

# Verification

# 

# ↓

# 

# Receipt generated

# 

# \---

# 

# \## Files

# 

# | File | Purpose |

# |------|---------|

# | `policy.json` | Vendor Payment Policy Reference |

# | `transaction.json` | Vendor Payment Business Transaction |

# | `run.ts` | Executes the complete workflow |

# 

# \---

# 

# \## Architecture

# 

# ```

# Vendor Invoice

# &#x20;      │

# &#x20;      ▼

# Authority

# &#x20;      │

# &#x20;      ▼

# Authorization

# &#x20;      │

# &#x20;      ▼

# Intent

# &#x20;      │

# &#x20;      ▼

# Policy Evaluation

# &#x20;      │

# &#x20;      ▼

# Runtime

# &#x20;      │

# &#x20;      ▼

# Execution Trust Record

# &#x20;      │

# &#x20;      ▼

# Verification

# &#x20;      │

# &#x20;      ▼

# Receipt

# ```

# 

# \---

# 

# \## Run

# 

# ```bash

# npm run example -- vendor-payment

# ```

# 

# or

# 

# ```bash

# tsx run.ts

# ```

# 

# \---

# 

# \## Expected Output

# 

# The scenario prints:

# 

# \- Business Transaction

# \- Policy

# \- Decision

# \- Execution Trust Record

# \- Verification

# \- Receipt

# 

# \---

# 

# \## Related Tutorials

# 

# \- Tutorial 03 — Runtime Execution

# \- Tutorial 05 — Verification

# \- Tutorial 07 — Receipt Generation

# \- Tutorial 10 — End-to-End

