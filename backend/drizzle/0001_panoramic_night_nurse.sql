ALTER TABLE "users" ADD COLUMN "reseller_owner_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_reseller_owner_id_resellers_id_fk" FOREIGN KEY ("reseller_owner_id") REFERENCES "public"."resellers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
