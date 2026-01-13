/**
 * Shared types for the application
 */

export interface ContactInfo {
  name: string
  role: string
  email?: string | null
  phone?: string | null
  website?: string | null
  address?: string | null
  party?: string | null
  riding?: string | null
  district?: string | null
}
