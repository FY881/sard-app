#!/usr/bin/env bash
# Boots an Android emulator on the GitHub runner (own script so every step is logged
# into shots/emulator.log), then runs the screenshot flows.
set -x
SDK="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
export PATH="$SDK/cmdline-tools/latest/bin:$SDK/emulator:$SDK/platform-tools:$PATH"
ls -la /dev/kvm; nproc; free -m; df -h /
sudo rm -rf /usr/share/dotnet /opt/ghc /usr/local/.ghcup /opt/hostedtoolcache/CodeQL /usr/local/share/boost || true
df -h /
export ANDROID_AVD_HOME="$HOME/.android/avd"; mkdir -p "$ANDROID_AVD_HOME"
IMG="system-images;android-31;google_apis;x86_64"
yes | sdkmanager --licenses >/dev/null
sdkmanager --install "platform-tools" "emulator" "$IMG" > /dev/null; echo sdk-install $?
echo no | avdmanager create avd -n sard -k "$IMG" -d pixel_6 -p "$ANDROID_AVD_HOME/sard.avd" --force
ls -la "$ANDROID_AVD_HOME" "$ANDROID_AVD_HOME/sard.avd"
CFG="$ANDROID_AVD_HOME/sard.avd/config.ini"
{ echo "hw.ramSize=3072"; echo "hw.cpu.ncore=2"; echo "disk.dataPartition.size=2G"; echo "hw.keyboard=yes"; } >> "$CFG"
nohup emulator -avd sard -no-window -gpu swiftshader_indirect -no-snapshot -noaudio -no-boot-anim -no-metrics -accel on > shots/emulator-run.log 2>&1 &
timeout 600 adb wait-for-device || { tail -50 shots/emulator-run.log; exit 1; }
for i in $(seq 1 180); do
  [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break
  sleep 5
done
adb shell getprop sys.boot_completed
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
bash .maestro/run-screens.sh > shots/run.log 2>&1
rc=$?
echo "screens exit $rc"
adb emu kill || true
exit $rc
