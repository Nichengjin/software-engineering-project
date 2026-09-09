PROJECT ?=
SLUG ?=

.PHONY: init check-docs check-repo ci release-package new-history new-plan new-iteration new-spec new-adr

init:
	@if [ -z "$(PROJECT)" ]; then echo "用法: make init PROJECT=项目名"; exit 1; fi
	./scripts/init-project.sh "$(PROJECT)"

check-docs:
	./scripts/check-docs.sh

check-repo:
	./scripts/check-docs.sh
	./scripts/check-repo-hygiene.sh

ci:
	./scripts/ci.sh

release-package:
	./scripts/release-package.sh

new-history:
	@if [ -z "$(SLUG)" ]; then echo "用法: make new-history SLUG=变更名"; exit 1; fi
	./scripts/new-history.sh "$(SLUG)"

new-plan:
	@if [ -z "$(SLUG)" ]; then echo "用法: make new-plan SLUG=计划名"; exit 1; fi
	./scripts/new-exec-plan.sh "$(SLUG)"

new-iteration:
	@if [ -z "$(SLUG)" ]; then echo "用法: make new-iteration SLUG=迭代名"; exit 1; fi
	./scripts/new-iteration.sh "$(SLUG)"

new-spec:
	@if [ -z "$(SLUG)" ]; then echo "用法: make new-spec SLUG=用户故事名"; exit 1; fi
	./scripts/new-spec.sh "$(SLUG)"

new-adr:
	@if [ -z "$(SLUG)" ]; then echo "用法: make new-adr SLUG=决策名"; exit 1; fi
	./scripts/new-adr.sh "$(SLUG)"
