export interface POI {
  id: number;
  long: number;
  lat: number;
  name: string;
  alt_name: string | null;
  subtitle: string | null;
  category_name: string | null;
  description: string | null;
  image: string | null;
  hours: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  wheelchair_accessible: string | null;
  type: string | null;
  class: string | null;
}
