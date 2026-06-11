ALTER TABLE "fantasy_teams" ADD COLUMN "captain_id" text;--> statement-breakpoint
ALTER TABLE "fantasy_teams" ADD COLUMN "period" text DEFAULT 'group_1' NOT NULL;--> statement-breakpoint
ALTER TABLE "fantasy_teams" ADD COLUMN "baseline_player_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "fantasy_teams" ADD CONSTRAINT "fantasy_teams_captain_id_players_id_fk" FOREIGN KEY ("captain_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;