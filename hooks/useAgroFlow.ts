// hooks/useAgroFlow.ts
import { useState, useEffect, useCallback, useRef } from 'react'
import { initializeApp, getApps } from 'firebase/app'
import { getDatabase, ref, onValue, off, get, query, orderByChild, limitToLast } from 'firebase/database'
import { getFirestore, collection, query as firestoreQuery, orderBy, limit, getDocs, where, Timestamp } from 'firebase/firestore'

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
}

// Validate required environment variables
const requiredEnvVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_DATABASE_URL',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID'
]

const missingVars = requiredEnvVars.filter(varName => !process.env[`${varName}`])

if (missingVars.length > 0 && typeof window !== 'undefined') {
  console.error('Missing required Firebase environment variables:', missingVars.join(', '))
}

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
const database = getDatabase(app)
const firestore = getFirestore(app)

// Updated types matching ESP32 v4.0 schema
export interface LiveData {
  device_id: string
  timestamp: string
  air_temperature: number      // x10 format (255 = 25.5°C)
  soil_temperature: number     // x10 format
  humidity: number
  moisture_surface: number     // 0-100%
  moisture_root: number        // 0-100% - Most critical reading
  moisture_deep: number        // 0-100%
  pump_active: boolean
  pump_state: string          // "ON" or "OFF"
  irrigation_reason: string    // Human readable reason
  wifi_signal: number         // dBm
  daily_irrigations: number
  rtdb_uploads: number
  firestore_uploads: number
  system_status: string       // "operational"
  last_irrigation: number     // timestamp in ms
  sensor_status: {
    dht_working: boolean
    ds18b20_working: boolean
    moisture_working: boolean
  }
}

export interface HistoricalReading {
  device_id: string
  timestamp: string
  date: string
  air_temperature: number      // x10 format
  soil_temperature: number     // x10 format  
  humidity: number
  moisture_surface: number
  moisture_root: number
  moisture_deep: number
  pump_active: boolean
  pump_state: string
  irrigation_reason: string
  daily_cycles: number
  wifi_signal_dbm: number
  uptime_ms: number
  rtdb_uploads: number
  firestore_uploads: number
}

export interface IrrigationEvent {
  device: string
  timestamp: string
  event: string               // "started" or "completed"
  moisture_surface: number
  moisture_root: number       // Critical moisture level
  moisture_deep: number
  air_temp: number           // x10 format
  soil_temp: number          // x10 format
  daily_count: number
}

export interface DeviceStatus {
  last_seen: string
  online: boolean
  pump_active: boolean
  root_moisture: number      // Most important metric
  daily_irrigations: number
  system_health: string
}

interface UseAgroFlowDataReturn {
  currentData: LiveData | null
  historicalData: HistoricalReading[]
  irrigationEvents: IrrigationEvent[]
  deviceStatus: DeviceStatus | null
  loading: boolean
  error: string | null
  connected: boolean
  lastUpdate: string | null
  refreshData: () => void
}

export const useAgroFlowData = (deviceId: string = 'AF001'): UseAgroFlowDataReturn => {
  // State management
  const [currentData, setCurrentData] = useState<LiveData | null>(null)
  const [historicalData, setHistoricalData] = useState<HistoricalReading[]>([])
  const [irrigationEvents, setIrrigationEvents] = useState<IrrigationEvent[]>([])
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)

  // Refs for cleanup
  const liveDataRef = useRef<any>(null)
  const deviceStatusRef = useRef<any>(null)

  // Helper function to safely convert Firestore data
  const convertFirestoreDoc = (doc: any): HistoricalReading | null => {
    try {
      const data = doc.data()
      return {
        device_id: data.fields?.device_id?.stringValue || deviceId,
        timestamp: data.fields?.timestamp?.stringValue || '',
        date: data.fields?.date?.stringValue || '',
        air_temperature: data.fields?.air_temperature?.integerValue || 0,
        soil_temperature: data.fields?.soil_temperature?.integerValue || 0,
        humidity: data.fields?.humidity?.integerValue || 0,
        moisture_surface: data.fields?.moisture_surface?.integerValue || 0,
        moisture_root: data.fields?.moisture_root?.integerValue || 0,
        moisture_deep: data.fields?.moisture_deep?.integerValue || 0,
        pump_active: data.fields?.pump_active?.booleanValue || false,
        pump_state: data.fields?.pump_state?.stringValue || 'OFF',
        irrigation_reason: data.fields?.irrigation_reason?.stringValue || '',
        daily_cycles: data.fields?.daily_cycles?.integerValue || 0,
        wifi_signal_dbm: data.fields?.wifi_signal_dbm?.integerValue || 0,
        uptime_ms: data.fields?.uptime_ms?.integerValue || 0,
        rtdb_uploads: data.fields?.rtdb_uploads?.integerValue || 0,
        firestore_uploads: data.fields?.firestore_uploads?.integerValue || 0
      }
    } catch (err) {
      console.error('Error converting Firestore doc:', err)
      return null
    }
  }

  // Fetch historical data from Firestore
  const fetchHistoricalData = useCallback(async () => {
    try {
      // Simplified query - just get recent documents without device filter for now
      const q = firestoreQuery(
        collection(firestore, 'sensor_readings'),
        orderBy('fields.timestamp.stringValue', 'desc'),
        limit(48) // Last 48 readings (24 hours if every 30 minutes)
      )
      
      const querySnapshot = await getDocs(q)
      const readings: HistoricalReading[] = []
      
      querySnapshot.forEach((doc) => {
        const reading = convertFirestoreDoc(doc)
        if (reading) {
          readings.push(reading)
        }
      })
      
      setHistoricalData(readings)
      console.log(`Fetched ${readings.length} historical readings`)
    } catch (err) {
      console.error('Error fetching historical data:', err)
      setError(`Failed to fetch historical data: ${err}`)
    }
  }, [deviceId])

  // Fetch irrigation events from RTDB (no index required)
  const fetchIrrigationEvents = useCallback(async () => {
    try {
      const irrigationRef = ref(database, `irrigation_log/${deviceId}`)
      
      // Get all irrigation events without ordering (no index required)
      const snapshot = await get(irrigationRef)
      
      if (snapshot.exists()) {
        const events: IrrigationEvent[] = []
        snapshot.forEach((childSnapshot) => {
          const data = childSnapshot.val()
          if (typeof data === 'object' && data !== null) {
            events.push(data as IrrigationEvent)
          }
        })
        
        // Sort by timestamp on client side (newest first)
        events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        
        // Take last 20 events
        const recentEvents = events.slice(0, 20)
        setIrrigationEvents(recentEvents)
        console.log(`Fetched ${recentEvents.length} irrigation events`)
      } else {
        setIrrigationEvents([])
        console.log('No irrigation events found')
      }
    } catch (err) {
      console.error('Error fetching irrigation events:', err)
      setError(`Failed to fetch irrigation events: ${err}`)
    }
  }, [deviceId])

  // Setup real-time listeners
  const setupRealTimeListeners = useCallback(() => {
    // Live data listener
    const liveDataPath = ref(database, `live_monitoring/${deviceId}`)
    liveDataRef.current = onValue(
      liveDataPath,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val()
          setCurrentData(data as LiveData)
          setConnected(true)
          setLastUpdate(new Date().toISOString())
          setError(null)
          console.log('Live data updated:', data.timestamp)
        } else {
          setCurrentData(null)
          setConnected(false)
          console.log('No live data available')
        }
      },
      (error) => {
        console.error('Live data listener error:', error)
        setError(`Real-time connection failed: ${error.message}`)
        setConnected(false)
      }
    )

    // Device status listener
    const deviceStatusPath = ref(database, `device_status/${deviceId}`)
    deviceStatusRef.current = onValue(
      deviceStatusPath,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val()
          setDeviceStatus(data as DeviceStatus)
          console.log('Device status updated:', data.last_seen)
        } else {
          setDeviceStatus(null)
        }
      },
      (error) => {
        console.error('Device status listener error:', error)
      }
    )
  }, [deviceId])

  // Cleanup listeners
  const cleanup = useCallback(() => {
    if (liveDataRef.current) {
      off(ref(database, `live_monitoring/${deviceId}`), 'value', liveDataRef.current)
      liveDataRef.current = null
    }
    if (deviceStatusRef.current) {
      off(ref(database, `device_status/${deviceId}`), 'value', deviceStatusRef.current)
      deviceStatusRef.current = null
    }
  }, [deviceId])

  // Refresh all data
  const refreshData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch static data
      await Promise.all([
        fetchHistoricalData(),
        fetchIrrigationEvents()
      ])

      // Get current live data snapshot
      const liveDataSnapshot = await get(ref(database, `live_monitoring/${deviceId}`))
      if (liveDataSnapshot.exists()) {
        setCurrentData(liveDataSnapshot.val() as LiveData)
        setConnected(true)
        setLastUpdate(new Date().toISOString())
      }

      // Get current device status
      const statusSnapshot = await get(ref(database, `device_status/${deviceId}`))
      if (statusSnapshot.exists()) {
        setDeviceStatus(statusSnapshot.val() as DeviceStatus)
      }

      console.log('Data refresh completed')
    } catch (err) {
      console.error('Error refreshing data:', err)
      setError(`Failed to refresh data: ${err}`)
    } finally {
      setLoading(false)
    }
  }, [deviceId, fetchHistoricalData, fetchIrrigationEvents])

  // Initialize and setup listeners
  useEffect(() => {
    console.log(`Setting up AgroFlow data for device: ${deviceId}`)
    
    setLoading(true)
    setError(null)

    // Setup real-time listeners
    setupRealTimeListeners()

    // Initial data fetch
    refreshData()

    // Cleanup on unmount or deviceId change
    return cleanup
  }, [deviceId, setupRealTimeListeners, refreshData, cleanup])

  // Auto-refresh historical data every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('Auto-refreshing historical data')
      fetchHistoricalData()
      fetchIrrigationEvents()
    }, 5 * 60 * 1000) // 5 minutes

    return () => clearInterval(interval)
  }, [fetchHistoricalData, fetchIrrigationEvents])

  return {
    currentData,
    historicalData,
    irrigationEvents,
    deviceStatus,
    loading,
    error,
    connected,
    lastUpdate,
    refreshData
  }
}

// Helper hook for connection testing
export const useAgroFlowConnection = () => {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting')
  const [lastPing, setLastPing] = useState<Date | null>(null)

  const testConnection = useCallback(async () => {
    try {
      setConnectionStatus('connecting')
      
      // Test RTDB connection
      const testRef = ref(database, '.info/connected')
      const snapshot = await get(testRef)
      
      if (snapshot.exists()) {
        setConnectionStatus('connected')
        setLastPing(new Date())
        return true
      } else {
        setConnectionStatus('error')
        return false
      }
    } catch (err) {
      console.error('Connection test failed:', err)
      setConnectionStatus('error')
      return false
    }
  }, [])

  useEffect(() => {
    testConnection()
    
    // Test connection every 30 seconds
    const interval = setInterval(testConnection, 30 * 1000)
    
    return () => clearInterval(interval)
  }, [testConnection])

  return {
    connectionStatus,
    lastPing,
    testConnection
  }
}