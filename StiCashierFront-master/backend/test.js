@echo off
echo TEST LOG OUTPUT
node -e "console.log('Node console.log works'); process.stderr.write('[stderr] stderr works\n')"
