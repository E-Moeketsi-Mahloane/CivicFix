import { type FormEvent, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { isDemoMode, supabase } from '../lib/supabase'

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/'
  return value
}

const southAfricanProvinces = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
]

type CivicProfile = {
  full_name: string
  app_role: string
  municipality_id: string | null
  phone_number: string | null
  province: string | null
  ward: string | null
  suburb_or_township: string | null
  is_active: boolean
}

type MunicipalityOption = { id: string; name: string; province: string }

export function ProfileSetupGate({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<CivicProfile | null>(null)
  const [municipalities, setMunicipalities] = useState<MunicipalityOption[]>([])
  const [isLoading, setIsLoading] = useState(Boolean(supabase))
  const [loadError, setLoadError] = useState('')
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    const client = supabase
    if (!client) return

    let isActive = true
    let requestSequence = 0
    const loadAccount = async (nextUser: User | null) => {
      const request = ++requestSequence
      setUser(nextUser)
      setLoadError('')
      if (!nextUser) {
        setProfile(null)
        setMunicipalities([])
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const [profileResult, municipalitiesResult] = await Promise.all([
          client.from('profiles')
            .select('full_name,app_role,municipality_id,phone_number,province,ward,suburb_or_township,is_active')
            .eq('id', nextUser.id)
            .maybeSingle(),
          client.from('municipalities')
            .select('id,name,province')
            .eq('is_active', true)
            .order('province')
            .order('name'),
        ])
        if (profileResult.error) throw profileResult.error
        if (municipalitiesResult.error) throw municipalitiesResult.error
        if (!profileResult.data) {
          throw new Error('Your active database profile could not be found. Please contact the CivicFix administrator.')
        }
        if (!isActive || request !== requestSequence) return
        setProfile(profileResult.data as CivicProfile)
        setMunicipalities((municipalitiesResult.data ?? []) as MunicipalityOption[])
      } catch (cause) {
        if (!isActive || request !== requestSequence) return
        setProfile(null)
        setMunicipalities([])
        setLoadError(cause instanceof Error ? cause.message : 'Could not load your database profile.')
      } finally {
        if (isActive && request === requestSequence) setIsLoading(false)
      }
    }

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => void loadAccount(session?.user ?? null), 0)
    })
    void client.auth.getSession().then(({ data, error }) => {
      if (error) throw error
      return loadAccount(data.session?.user ?? null)
    }).catch((cause: unknown) => {
      if (!isActive) return
      setLoadError(cause instanceof Error ? cause.message : 'Could not check your account.')
      setIsLoading(false)
    })

    return () => {
      isActive = false
      subscription.unsubscribe()
    }
  }, [retryCount])

  if (isLoading) {
    return <div className="auth-gate-message" role="status">Checking your database profile…</div>
  }
  if (loadError) {
    return (
      <div className="auth-gate-message" role="alert">
        <p>We couldn’t load your account profile and municipality data, so we can’t confirm whether profile setup is complete.</p>
        <p>{loadError}</p>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setLoadError('')
            setIsLoading(true)
            setRetryCount((count) => count + 1)
          }}
        >
          Try again
        </button>
      </div>
    )
  }

  const selectedMunicipality = profile?.municipality_id
    ? municipalities.find((municipality) => municipality.id === profile.municipality_id)
    : undefined
  const hasCompletedSetup = Boolean(
    profile?.is_active &&
    profile.province &&
    southAfricanProvinces.includes(profile.province) &&
    selectedMunicipality?.province === profile.province,
  )
  const reloadProfile = async () => {
    if (!user) return
    const client = supabase
    if (!client) throw new Error('Profile setup is unavailable because Supabase is not configured.')
    const [profileResult, municipalitiesResult] = await Promise.all([
      client.from('profiles')
        .select('full_name,app_role,municipality_id,phone_number,province,ward,suburb_or_township,is_active')
        .eq('id', user.id)
        .maybeSingle(),
      client.from('municipalities')
        .select('id,name,province')
        .eq('is_active', true)
        .order('province')
        .order('name'),
    ])
    if (profileResult.error) throw profileResult.error
    if (municipalitiesResult.error) throw municipalitiesResult.error
    if (!profileResult.data) throw new Error('The saved database profile could not be found.')
    setProfile(profileResult.data as CivicProfile)
    setMunicipalities((municipalitiesResult.data ?? []) as MunicipalityOption[])
  }

  if (user && profile && !profile.is_active) {
    return (
      <div className="auth-gate-message" role="alert">
        <p>This account is inactive. Contact the CivicFix administrator for help.</p>
      </div>
    )
  }
  if (user && profile && !hasCompletedSetup) {
    return (
      <ProfileSetupPage
        user={user}
        profile={profile}
        municipalities={municipalities}
        onProfileSaved={reloadProfile}
      />
    )
  }
  if (user && !profile) {
    return <div className="auth-gate-message" role="alert">Your database profile could not be confirmed. Refresh the page or contact the CivicFix administrator.</div>
  }
  if (user && ['/login', '/signup'].includes(location.pathname)) return <Navigate to="/" replace />
  return <>{children}</>
}

function ProfileSetupPage({
  user,
  profile,
  municipalities,
  onProfileSaved,
}: {
  user: User
  profile: CivicProfile
  municipalities: MunicipalityOption[]
  onProfileSaved: () => Promise<void>
}) {
  const navigate = useNavigate()
  const initialMunicipality = municipalities.find((item) => item.id === profile.municipality_id)
  const isMunicipalStaff = profile.app_role !== 'citizen'
  const [fullName, setFullName] = useState(profile.full_name)
  const [phone, setPhone] = useState(profile.phone_number ?? '')
  const [province, setProvince] = useState(initialMunicipality?.province ?? profile.province ?? '')
  const [municipalityId, setMunicipalityId] = useState(profile.municipality_id ?? '')
  const [ward, setWard] = useState(profile.ward ?? '')
  const [suburb, setSuburb] = useState(profile.suburb_or_township ?? '')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const availableMunicipalities = municipalities.filter((municipality) => municipality.province === province)
  const currentMunicipality = municipalities.find((municipality) => municipality.id === municipalityId)

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
  }, [avatarPreview])

  const handleAvatarChange = (file?: File) => {
    setError('')
    setAvatarFile(null)
    setAvatarPreview('')
    if (!file) {
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPG, PNG, or WebP image for your profile picture.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Profile pictures must be 10 MB or smaller.')
      return
    }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!supabase) {
      setError('Profile setup is unavailable because Supabase is not configured.')
      return
    }
    if (!profile.is_active) {
      setError('This account is inactive. Contact the CivicFix administrator for help.')
      return
    }
    const normalizedName = fullName.trim()
    if (!normalizedName) {
      setError('Enter your full name.')
      return
    }
    if (!southAfricanProvinces.includes(province) || !currentMunicipality || currentMunicipality.province !== province) {
      setError('Choose an active municipality that belongs to the selected province.')
      return
    }

    setIsSubmitting(true)
    try {
      const previousAvatarPath = typeof user.user_metadata.avatar_path === 'string' ? user.user_metadata.avatar_path : null
      const previousFullName = typeof user.user_metadata.full_name === 'string'
        ? user.user_metadata.full_name
        : profile.full_name
      let avatarPath = previousAvatarPath
      if (avatarFile) {
        const extensionByType: Record<string, string> = {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/webp': 'webp',
        }
        const filePath = `${user.id}/profile-${crypto.randomUUID()}.${extensionByType[avatarFile.type]}`
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, avatarFile, { contentType: avatarFile.type, upsert: true })
        if (uploadError) {
          setError(`Profile picture upload failed: ${uploadError.message}. You can remove the optional picture and continue.`)
          return
        }
        avatarPath = filePath
      }

      const metadataChanged = avatarFile || normalizedName !== profile.full_name
      if (metadataChanged) {
        const { error: metadataError } = await supabase.auth.updateUser({
          data: { full_name: normalizedName, ...(avatarFile ? { avatar_path: avatarPath } : {}) },
        })
        if (metadataError) {
          const cleanupError = avatarFile && avatarPath
            ? (await supabase.storage.from('avatars').remove([avatarPath])).error
            : null
          setError(cleanupError
            ? `${metadataError.message} The uploaded picture could not be removed: ${cleanupError.message}`
            : metadataError.message)
          return
        }
      }

      const { data: updatedProfile, error: updateError } = await supabase.from('profiles').update({
        full_name: normalizedName,
        phone_number: phone.trim() || null,
        province,
        municipality_id: currentMunicipality.id,
        ward: ward.trim() || null,
        suburb_or_township: suburb.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id).select('id').maybeSingle()
      if (updateError) {
        const cleanupError = avatarFile && avatarPath
          ? (await supabase.storage.from('avatars').remove([avatarPath])).error
          : null
        const metadataRollbackError = metadataChanged
          ? (await supabase.auth.updateUser({
              data: { full_name: previousFullName, avatar_path: previousAvatarPath },
            })).error
          : null
        setError([
          updateError.message,
          cleanupError ? `The uploaded picture could not be removed: ${cleanupError.message}` : '',
          metadataRollbackError ? `The previous account details could not be restored: ${metadataRollbackError.message}` : '',
        ].filter(Boolean).join(' '))
        return
      }
      if (!updatedProfile) {
        let cleanupError = ''
        let metadataRollbackError = ''
        if (avatarFile && avatarPath) {
          const { error: storageError } = await supabase.storage.from('avatars').remove([avatarPath])
          cleanupError = storageError?.message ?? ''
        }
        if (metadataChanged) {
          const { error: rollbackError } = await supabase.auth.updateUser({
            data: { full_name: previousFullName, avatar_path: previousAvatarPath },
          })
          metadataRollbackError = rollbackError?.message ?? ''
        }
        setError([
          'Your profile was not updated. Confirm your account is active and try again.',
          cleanupError ? `The uploaded picture could not be removed: ${cleanupError}` : '',
          metadataRollbackError ? `The previous picture reference could not be restored: ${metadataRollbackError}` : '',
        ].filter(Boolean).join(' '))
        return
      }
      await onProfileSaved()
      navigate('/', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not save your profile. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="auth-page profile-setup-page" aria-labelledby="auth-title">
      <div className="auth-card">
        <img className="auth-logo" src="/Signin_Signup_CivicFix_icon.svg" alt="" />
        <h1 id="auth-title">Complete your profile</h1>
        <p className="auth-description">Add your community details to continue to CivicFix.</p>
        <p className="profile-privacy-note">
          Your province and municipality are saved to your CivicFix database profile so reports can be routed correctly. We do not ask for an ID number or street address.
        </p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Full name
            <input
              autoComplete="name"
              maxLength={100}
              onChange={(event) => setFullName(event.target.value)}
              required
              value={fullName}
            />
          </label>
          <label>
            Email address
            <input autoComplete="email" readOnly value={user.email ?? ''} />
          </label>
          <label>
            Phone number <span className="auth-optional">(optional)</span>
            <input autoComplete="tel" maxLength={30} onChange={(event) => setPhone(event.target.value)} type="tel" value={phone} />
          </label>
          <label>
            Province
            {isMunicipalStaff ? (
              <input readOnly required value={currentMunicipality?.province ?? ''} />
            ) : (
              <select
                onChange={(event) => {
                  setProvince(event.target.value)
                  setMunicipalityId('')
                }}
                required
                value={province}
              >
                <option value="">Choose your province</option>
                {southAfricanProvinces.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            )}
          </label>
          <label>
            Municipality
            {isMunicipalStaff ? (
              <input readOnly required value={currentMunicipality?.name ?? 'Assigned municipality is not active'} />
            ) : (
              <select
                autoComplete="address-level2"
                onChange={(event) => setMunicipalityId(event.target.value)}
                required
                value={municipalityId}
              >
                <option value="">Choose your municipality</option>
                {availableMunicipalities.map((municipality) => (
                  <option key={municipality.id} value={municipality.id}>{municipality.name}</option>
                ))}
              </select>
            )}
            {!municipalities.length ? <small>No active municipalities are available yet. Contact the CivicFix administrator.</small> : null}
          </label>
          <label>
            Ward <span className="auth-optional">(optional)</span>
            <input inputMode="numeric" maxLength={50} onChange={(event) => setWard(event.target.value)} value={ward} />
          </label>
          <label>
            Suburb or township <span className="auth-optional">(optional)</span>
            <input autoComplete="address-level3" maxLength={120} onChange={(event) => setSuburb(event.target.value)} value={suburb} />
          </label>
          <label>
            Profile picture <span className="auth-optional">(optional)</span>
            <input
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => handleAvatarChange(event.target.files?.[0])}
              type="file"
            />
            <small>JPG, PNG, or WebP; maximum 2 MB.</small>
          </label>
          {avatarPreview ? <img className="profile-avatar-preview" src={avatarPreview} alt="Profile picture preview" /> : null}
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="primary-button auth-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Saving profile…' : 'Save profile and continue'}
          </button>
        </form>
      </div>
    </section>
  )
}

function AuthPageShell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="auth-page" aria-labelledby="auth-title">
      <div className="auth-card">
        <img className="auth-logo" src="/Signin_Signup_CivicFix_icon.svg" alt="" />
        <h1 id="auth-title">{title}</h1>
        <p className="auth-description">{description}</p>
        {isDemoMode ? (
          <p className="auth-notice" role="status">
            Account access is not configured. Add the Supabase project URL and publishable key to your local environment, then restart the app.
          </p>
        ) : null}
        {children}
      </div>
    </section>
  )
}

export function SignUpPage() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')

    const normalizedName = fullName.trim()
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedName) {
      setError('Enter your full name.')
      return
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.')
      return
    }
    if (!supabase) {
      setError('Account creation is unavailable because Supabase is not configured.')
      return
    }

    setIsSubmitting(true)
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { full_name: normalizedName },
          emailRedirectTo: `${window.location.origin}/login?confirmed=1`,
        },
      })
      if (signUpError) {
        setError(signUpError.message)
        return
      }
      if (data.session) {
        navigate('/', { replace: true })
        return
      }
      setMessage('If an account could be created, check your email for a confirmation link to finish signing up.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not create your account. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthPageShell
      title="Create your account"
      description="Sign up to take part in your community. We only ask for your name and email."
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Full name
          <input
            autoComplete="name"
            maxLength={100}
            name="name"
            onChange={(event) => setFullName(event.target.value)}
            required
            value={fullName}
          />
        </label>
        <label>
          Email address
          <input
            autoComplete="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <label>
          Password
          <input
            autoComplete="new-password"
            minLength={8}
            name="new-password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          <small>Use at least 8 characters.</small>
        </label>
        <label>
          Confirm password
          <input
            autoComplete="new-password"
            name="confirm-password"
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            type="password"
            value={confirmPassword}
          />
        </label>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        {message ? <p className="auth-success" role="status">{message}</p> : null}
        <button className="primary-button auth-submit" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="auth-switch">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </AuthPageShell>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!supabase) {
      setError('Login is unavailable because Supabase is not configured.')
      return
    }

    setIsSubmitting(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })
      if (signInError) {
        setError(signInError.message)
        return
      }
      navigate(safeNextPath(searchParams.get('next')), { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not log you in. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthPageShell title="Welcome back" description="Log in to your CivicFix account.">
      {searchParams.get('confirmed') === '1' ? (
        <p className="auth-success" role="status">Your email confirmation link was opened. You can now log in.</p>
      ) : null}
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Email address
          <input
            autoComplete="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <label>
          Password
          <input
            autoComplete="current-password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="primary-button auth-submit" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className="auth-switch">
        New to CivicFix? <Link to="/signup">Create an account</Link>
      </p>
    </AuthPageShell>
  )
}
