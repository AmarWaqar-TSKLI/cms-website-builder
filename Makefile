# All targets delegate to scripts/make.mjs so there is exactly one implementation
# of every command. Windows users without GNU make run the identical logic via
# `.\make.cmd <target>`.
.PHONY: up down migrate seed dev worker test e2e verify demo reset logs clean help

help:
	@node scripts/make.mjs help

up:
	@node scripts/make.mjs up

down:
	@node scripts/make.mjs down

migrate:
	@node scripts/make.mjs migrate

seed:
	@node scripts/make.mjs seed

dev:
	@node scripts/make.mjs dev

worker:
	@node scripts/make.mjs worker

test:
	@node scripts/make.mjs test

e2e:
	@node scripts/make.mjs e2e

verify:
	@node scripts/make.mjs verify

demo:
	@node scripts/make.mjs demo

reset:
	@node scripts/make.mjs reset

logs:
	@node scripts/make.mjs logs

clean:
	@node scripts/make.mjs clean
