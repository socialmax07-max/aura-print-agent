# AURA Print Pro

> **Automated Multi-Tenant Cloud Print-on-Demand & Counter Spooling System**  
> Tailored for Indian Common Service Centres (CSC), Cyber Cafes, and Xerox Hubs.  
> **Architect & Lead Developer:** Sabir Ansari

---

## Executive Overview

**AURA Print Pro** solves the persistent counter bottleneck in Indian commercial print shops: customers crowding around the operator's PC with WhatsApp documents, pendrives, and manual UPI transfers. 

The platform turns any print shop into an automated, self-service station:
1. **Walk-in customers** scan a counter QR code, upload documents (PDF/images up to 100 MB), select print preferences (B&W/Color, Single/Duplex, page ranges), and pay instantly via NPCI-compliant UPI deep links or request counter cash verification.
2. **Shopkeepers** supervise incoming requests through a low-latency Operator Dashboard, verify payments using a 4–6 digit security PIN or UPI bank reference number (UTR), and manage rate cards.
3. **The Windows Print Agent** runs silently as a background service on the shop PC, claims queued jobs, and dispatches them directly to connected hardware (HP LaserJet, Epson EcoTank, Canon imageRUNNER) via headless SumatraPDF without operator intervention.
4. **Platform Owners** monitor multi-tenant usage, enforce subscription quotas, track monthly recurring revenue (MRR), and provision new tenant shops through a Super Admin Cockpit.

---

## System Architecture

