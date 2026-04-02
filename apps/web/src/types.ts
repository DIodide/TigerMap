export interface POI {
  id: number;
  lng: number;
  lat: number;
  name: string;
  alt?: string;
  sub?: string;
  cat?: string;
  cls?: string;
  type?: string;
  img?: string;
  phone?: string;
  web?: string;
  hours?: string;
  desc?: string;
  addr?: string;
  access?: string;
}

export interface FreefoodPost {
  id: number;
  message_id: string;
  subject: string;
  author_name: string;
  author_email: string;
  date: string;
  body_html: string;
  body_text: string;
  links: string;
  images: string;
  is_hoagiemail: number;
  hoagiemail_sender_name: string | null;
  hoagiemail_sender_email: string | null;
  listserv_url: string;
  created_at: string;
  location_name: string;
  lat: number;
  lng: number;
}
