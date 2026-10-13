#!/usr/bin/env bash
# Installs the Sard APK on the CI emulator and captures screenshots of every screen.
set -x
mkdir -p shots
touch /tmp/start
# Let the freshly booted system settle, and suppress ANR dialogs that block screenshots on slow CI emulators
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 2; done
adb shell settings put global hide_error_dialogs 1
adb shell settings put secure anr_show_background 0
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null
sleep 45
# Watchdog: dismiss any "isn't responding" dialog that still appears (taps Wait)
( while true; do
    if adb shell dumpsys window 2>/dev/null | grep -q "Application Not Responding"; then
      adb shell uiautomator dump /sdcard/u.xml >/dev/null 2>&1
      b=$(adb shell cat /sdcard/u.xml 2>/dev/null | grep -o 'text="Wait"[^>]*bounds="\[[0-9]*,[0-9]*\]' | grep -o '\[[0-9]*,[0-9]*\]' | tr -d '[]' | tr ',' ' ')
      [ -n "$b" ] && adb shell input tap $b || adb shell input keyevent KEYCODE_BACK
    fi
    sleep 3
  done ) &
WD=$!
adb install -r apk/*.apk || exit 1
adb shell settings put system system_locales ar-EG 2>/dev/null
adb shell monkey -p app.sard.reader -c android.intent.category.LAUNCHER 1
sleep 40
adb exec-out screencap -p > shots/00-launch.png
: > shots/flow-failures.txt
for f in .maestro/flows/*.yaml; do
  name=$(basename "$f" .yaml)
  # Each flow runs ../subflows/healthy.yaml after every screenshot/back: it fails when the
  # error boundary «حدث خطأ غير متوقع» is visible or the Android launcher is in front.
  maestro test --format junit --output "shots/$name.xml" --test-output-dir "maestro-out/$name" "$f" \
    || { echo "flow $name failed"; echo "$name: maestro flow failed (see shots/$name.xml)" >> shots/flow-failures.txt; }
  # Belt and braces: Sard must still be the focused app after the flow.
  focus=$(adb shell dumpsys window 2>/dev/null | grep -E "mCurrentFocus|mFocusedApp" | tr -d '\r')
  if ! echo "$focus" | grep -q "app.sard.reader"; then
    echo "$name: app not in foreground after flow: $focus" >> shots/flow-failures.txt
  fi
  fatals=$(adb logcat -d -s AndroidRuntime:E ReactNativeJS:E 2>/dev/null | grep -c -E "FATAL EXCEPTION|Rendered (fewer|more) hooks")
  if [ "${fatals:-0}" -gt "${prev_fatals:-0}" ]; then
    echo "$name: crash in logcat (FATAL EXCEPTION / hook-order error)" >> shots/flow-failures.txt
    adb logcat -d -s AndroidRuntime:E ReactNativeJS:E > "shots/crash-$name.txt"
  fi
  prev_fatals=$fatals
done
echo "flow failures: $(wc -l < shots/flow-failures.txt)"; cat shots/flow-failures.txt
# Maestro writes takeScreenshot files to the working dir
find . "$HOME/.maestro" -name "*.png" -newer /tmp/start -not -path "./shots/*" -exec cp {} shots/ \; 2>/dev/null || true
kill $WD 2>/dev/null
adb logcat -d -s ReactNativeJS:V AndroidRuntime:E > shots/logcat.txt
ls -la shots
# Non-zero exit when any flow failed or the app crashed/closed.
[ ! -s shots/flow-failures.txt ]
