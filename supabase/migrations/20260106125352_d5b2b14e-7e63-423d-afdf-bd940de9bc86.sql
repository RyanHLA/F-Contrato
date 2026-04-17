-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table for role management
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create site_images table for managing all site images
CREATE TABLE public.site_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section TEXT NOT NULL CHECK (section IN ('hero', 'about', 'gallery')),
    category TEXT, -- For gallery: casamentos, gestantes, 15-anos, etc.
    title TEXT,
    description TEXT,
    image_url TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on site_images
ALTER TABLE public.site_images ENABLE ROW LEVEL SECURITY;

-- Allow everyone to view site images (public portfolio)
CREATE POLICY "Anyone can view site images"
ON public.site_images
FOR SELECT
USING (true);

-- Only admins can insert images
CREATE POLICY "Admins can insert site images"
ON public.site_images
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can update images
CREATE POLICY "Admins can update site images"
ON public.site_images
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete images
CREATE POLICY "Admins can delete site images"
ON public.site_images
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- RLS for user_roles: admins can view all, users can view their own
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

-- Create storage bucket for site images
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-images', 'site-images', true);

-- Storage policies for admin uploads
CREATE POLICY "Anyone can view site images storage"
ON storage.objects
FOR SELECT
USING (bucket_id = 'site-images');

CREATE POLICY "Admins can upload site images"
ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id = 'site-images' 
    AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can update site images storage"
ON storage.objects
FOR UPDATE
USING (
    bucket_id = 'site-images' 
    AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete site images storage"
ON storage.objects
FOR DELETE
USING (
    bucket_id = 'site-images' 
    AND public.has_role(auth.uid(), 'admin')
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for site_images
CREATE TRIGGER update_site_images_updated_at
BEFORE UPDATE ON public.site_images
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();