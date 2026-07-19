@echo off
REM Windows shim: `make.cmd demo` runs the same logic as `make demo` on POSIX.
node "%~dp0scripts\make.mjs" %*
