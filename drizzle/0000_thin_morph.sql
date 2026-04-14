CREATE TABLE "bento_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid,
	"layout" jsonb NOT NULL,
	"extracted" jsonb NOT NULL,
	"source_type" text DEFAULT 'text' NOT NULL,
	"og_image_url" text,
	"published_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "bento_pages_model_id_unique" UNIQUE("model_id")
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "models_provider_name_unique" UNIQUE("provider","name")
);
--> statement-breakpoint
CREATE TABLE "source_texts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "source_texts_model_id_unique" UNIQUE("model_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" bigint NOT NULL,
	"username" text NOT NULL,
	"avatar_url" text,
	"banned_at" timestamp with time zone,
	"banned_reason" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
ALTER TABLE "bento_pages" ADD CONSTRAINT "bento_pages_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "models" ADD CONSTRAINT "models_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_texts" ADD CONSTRAINT "source_texts_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;