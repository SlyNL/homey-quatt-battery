#!/bin/bash
set -e

# Auto-answer prompts for homey app publish
(
  echo "y"  # Uncommitted changes confirmation
  sleep 1
  echo "y"  # Guidelines confirmation
  sleep 1
  echo "n"  # Don't update version (already at 1.0.19)
) | homey app publish
