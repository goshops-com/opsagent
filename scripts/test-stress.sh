#!/bin/bash

# Test stress scenarios for system monitor
# Usage: ./scripts/test-stress.sh [cpu|memory|disk|all]

set -e

SCENARIO=${1:-help}

case $SCENARIO in
  cpu)
    echo "🔥 Starting CPU stress test (60 seconds, 2 workers)..."
    echo "This will spike CPU usage to trigger alerts."
    stress-ng --cpu 2 --timeout 60s --metrics-brief
    ;;

  memory)
    echo "🔥 Starting Memory stress test (60 seconds, 256MB)..."
    echo "This will consume memory to trigger alerts."
    stress-ng --vm 2 --vm-bytes 256M --timeout 60s --metrics-brief
    ;;

  disk)
    echo "🔥 Starting Disk I/O stress test (60 seconds)..."
    echo "This will create disk activity."
    stress-ng --hdd 1 --timeout 60s --metrics-brief
    ;;

  io)
    echo "🔥 Starting combined I/O stress test (60 seconds)..."
    stress-ng --io 2 --timeout 60s --metrics-brief
    ;;

  all)
    echo "🔥 Starting combined stress test (60 seconds)..."
    echo "CPU + Memory + Disk I/O"
    stress-ng --cpu 1 --vm 1 --vm-bytes 128M --hdd 1 --timeout 60s --metrics-brief
    ;;

  light)
    echo "🔥 Starting light stress test (30 seconds)..."
    echo "Just enough to trigger warning thresholds."
    stress-ng --cpu 1 --timeout 30s --metrics-brief
    ;;

  zombie)
    echo "🧟 Creating zombie processes..."
    # Create a zombie process
    ( sleep 1 & exec sleep 60 ) &
    echo "Zombie process created. Will auto-cleanup in 60s."
    ;;

  help|*)
    echo "System Monitor Stress Test Script"
    echo ""
    echo "Usage: $0 [scenario]"
    echo ""
    echo "Scenarios:"
    echo "  cpu      - CPU stress (2 workers, 60s)"
    echo "  memory   - Memory stress (256MB, 60s)"
    echo "  disk     - Disk I/O stress (60s)"
    echo "  io       - I/O stress (60s)"
    echo "  all      - Combined CPU + Memory + Disk (60s)"
    echo "  light    - Light CPU stress (30s)"
    echo "  zombie   - Create zombie process"
    echo "  help     - Show this help"
    echo ""
    echo "Example:"
    echo "  # Run in container:"
    echo "  docker compose exec monitor ./scripts/test-stress.sh cpu"
    echo ""
    echo "  # Or run stress container:"
    echo "  docker compose run stress stress-ng --cpu 2 --timeout 60s"
    ;;
esac
