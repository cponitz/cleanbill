"""Texas Refund Desk — core package.

Sub-packages:
  etl        — loads the TCAD (Travis Central Appraisal District) appraisal export and builds the lead list
  estimator  — per-taxing-unit tax rates, exemption amounts, and refund math
  letters    — outreach letter PDF generation
  agent      — the Claude tool-use agent that processes claims (ops/concierge)
"""
