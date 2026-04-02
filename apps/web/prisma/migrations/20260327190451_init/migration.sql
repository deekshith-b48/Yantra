-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "github_token" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "default_branch" TEXT NOT NULL DEFAULT 'main',
    "last_indexed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "repo_id" UUID NOT NULL,
    "spec" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "plan" JSONB,
    "pr_url" TEXT,
    "pr_number" INTEGER,
    "branch_name" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID NOT NULL,
    "step" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "log" TEXT[],
    "started_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ,

    CONSTRAINT "run_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerk_id_key" ON "users"("clerk_id");

-- AddForeignKey
ALTER TABLE "repos" ADD CONSTRAINT "repos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "repos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
