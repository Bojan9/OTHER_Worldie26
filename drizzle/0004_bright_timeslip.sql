CREATE TABLE "fantasy_teams" (
	"user_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"formation" text NOT NULL,
	"player_ids" jsonb NOT NULL,
	"starter_ids" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fantasy_teams" ADD CONSTRAINT "fantasy_teams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;