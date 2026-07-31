# Helm Chart

**Owner:** Infrastructure Lead
**Status:** Phase 2

Chart for clustered deployment.

Workers scale on **queue depth**, not CPU — transcription is a long, bursty, GPU-bound workload and
CPU-based autoscaling gets it consistently wrong.
