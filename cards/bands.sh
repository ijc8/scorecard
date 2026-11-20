#!/bin/sh
# Print RMS level (dB) per frequency band for a stretch of a WAV. usage: ./bands.sh file.wav [start=0] [dur=20]
band() { ffmpeg -v info -nostats -ss ${2:-0} -t ${3:-20} -i "$1" -af "$4,volumedetect" -f null - 2>&1 | sed -n 's/.*mean_volume: //p'; }
echo "total:    $(band $1 "$2" "$3" anull)"
echo "<120:     $(band $1 "$2" "$3" lowpass=120,lowpass=120)"
echo "120-400:  $(band $1 "$2" "$3" highpass=120,highpass=120,lowpass=400,lowpass=400)"
echo "400-1.5k: $(band $1 "$2" "$3" highpass=400,highpass=400,lowpass=1500,lowpass=1500)"
echo "1.5k-5k:  $(band $1 "$2" "$3" highpass=1500,highpass=1500,lowpass=5000,lowpass=5000)"
echo ">5k:      $(band $1 "$2" "$3" highpass=5000,highpass=5000)"
