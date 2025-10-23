'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  Droplets, 
  Thermometer, 
  Gauge, 
  Zap, 
  Wifi, 
  WifiOff, 
  AlertTriangle, 
  CheckCircle,
  TrendingUp,
  Calendar,
  MapPin,
  Settings,
  RefreshCw,
  Download,
  Database,
  AlertCircle,
  Inbox,
  Activity,
  Wind,
  Clock,
  Power,
  CheckCircle2,
  XCircle
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar } from 'recharts'
import { useAgroFlowData } from '@/hooks/useAgroFlow'

// Updated types matching ESP32 v4.0 Firebase schema
interface LiveData {
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

interface HistoricalReading {
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
  daily_cycles: number
  wifi_signal_dbm: number
  uptime_ms: number
}

interface IrrigationEvent {
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

interface DeviceStatus {
  last_seen: string
  online: boolean
  pump_active: boolean
  root_moisture: number      // Most important metric
  daily_irrigations: number
  system_health: string
}

// Empty State Components
const EmptyState = ({ 
  icon: Icon, 
  title, 
  description, 
  action 
}: { 
  icon: any, 
  title: string, 
  description: string, 
  action?: React.ReactNode 
}) => (
  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
    <Icon className="w-12 h-12 text-gray-400 mb-4" />
    <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
    <p className="text-gray-600 mb-4 max-w-md">{description}</p>
    {action}
  </div>
)

const LoadingCard = () => (
  <Card>
    <CardHeader>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </CardHeader>
    <CardContent>
      <Skeleton className="h-8 w-1/3 mb-2" />
      <Skeleton className="h-3 w-2/3" />
    </CardContent>
  </Card>
)

const LoadingChart = () => (
  <Card>
    <CardHeader>
      <Skeleton className="h-5 w-1/2" />
    </CardHeader>
    <CardContent>
      <Skeleton className="h-[250px] w-full" />
    </CardContent>
  </Card>
)

export default function AgroFlowDashboard() {
  const [deviceId, setDeviceId] = useState('AF001') // Default device ID
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h')
  const [showRawData, setShowRawData] = useState(false)
  const [pumpControlLoading, setPumpControlLoading] = useState(false)
  
  const {
    currentData,
    historicalData,
    irrigationEvents,
    deviceStatus,
    loading,
    error,
    connected,
    lastUpdate,
    refreshData,
    controlPump
  } = useAgroFlowData(deviceId)

  // Helper functions for new data format
  const convertTempFromX10 = (tempX10: number): number => {
    if (!tempX10 || tempX10 === 0) return 0
    return tempX10 / 10
  }
  
  const getMoistureStatus = (moisture: number) => {
    if (moisture < 30) return { status: 'Critical', color: 'destructive' as const, bgColor: 'bg-red-100' }
    if (moisture < 50) return { status: 'Low', color: 'warning' as const, bgColor: 'bg-yellow-100' }
    if (moisture < 70) return { status: 'Good', color: 'default' as const, bgColor: 'bg-green-100' }
    return { status: 'Excellent', color: 'success' as const, bgColor: 'bg-blue-100' }
  }

  const getWifiStrength = (signal: number) => {
    if (!signal) return { strength: 'Unknown', bars: 0, color: 'gray' }
    if (signal > -50) return { strength: 'Excellent', bars: 4, color: 'green' }
    if (signal > -60) return { strength: 'Good', bars: 3, color: 'blue' }  
    if (signal > -70) return { strength: 'Fair', bars: 2, color: 'yellow' }
    return { strength: 'Weak', bars: 1, color: 'red' }
  }

  const formatTimeAgo = (timestamp: string | number): string => {
    if (!timestamp) return 'Never'
    
    const now = Date.now()
    const time = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp
    const diff = now - time
    
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
  }

  const formatHistoricalData = () => {
    if (!historicalData?.length) return []
    
    return historicalData
      .slice(-24) // Last 24 readings
      .map((reading: HistoricalReading) => ({
        time: new Date(reading.timestamp).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
        soilTemp: convertTempFromX10(reading.soil_temperature),
        airTemp: convertTempFromX10(reading.air_temperature),
        humidity: reading.humidity,
        moisture1: reading.moisture_surface,
        moisture2: reading.moisture_root,
        moisture3: reading.moisture_deep,
        pumpActive: reading.pump_active
      }))
  }

  const formatIrrigationData = () => {
    if (!irrigationEvents?.length) return []
    
    return irrigationEvents
      .filter((event: IrrigationEvent) => event.event === 'started')
      .slice(-7) // Last 7 irrigation events
      .map((event: IrrigationEvent) => ({
        date: new Date(event.timestamp).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        }),
        moistureBefore: event.moisture_root,
        airTemp: convertTempFromX10(event.air_temp),
        soilTemp: convertTempFromX10(event.soil_temp),
        dailyCount: event.daily_count
      }))
  }

  // Cast currentData to LiveData type
  const liveData: LiveData = currentData as LiveData
  const status: DeviceStatus = deviceStatus as DeviceStatus

  // Pump control handler
  const handlePumpControl = async () => {
    if (!liveData) return

    setPumpControlLoading(true)
    try {
      // Toggle pump state - if currently active (ON), turn OFF, else turn ON
      const newState = liveData.pump_active ? 'OFF' : 'ON'
      const success = await controlPump(newState)

      if (success) {
        console.log(`Pump ${newState} command sent successfully`)
      } else {
        console.error('Failed to send pump control command')
      }
    } catch (error) {
      console.error('Error controlling pump:', error)
    } finally {
      setPumpControlLoading(false)
    }
  }

  // Error State
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-4">
        <div className="max-w-4xl mx-auto">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to connect to Firebase: {error}
              <Button onClick={refreshData} variant="outline" size="sm" className="ml-4">
                <RefreshCw className="w-4 h-4 mr-1" />
                Retry
              </Button> 
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-2">
              🌱 AgroFlow Dashboard
            </h1>
            <p className="text-gray-600">
              Smart Irrigation System - Device: {deviceId}
              {/* {status?.last_seen && (
                <span className="ml-2 text-sm">
                  • Last seen: {formatTimeAgo(status.last_seen)}
                </span>
              )} */}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={connected && status?.online ? "default" : "destructive"} className="flex items-center gap-1">
              {connected && status?.online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {connected && status?.online ? 'Online' : 'Offline'}
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              <Database className="w-3 h-3" />
              {liveData?.system_status || 'Unknown'}
            </Badge>
            <Button onClick={refreshData} disabled={loading} size="sm">
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Connection Status Alert */}
        {!connected && (
          <Alert>
            <Database className="h-4 w-4" />
            <AlertDescription>
              No real-time connection to Firebase. Showing last known data.
              {lastUpdate && ` Last update: ${new Date(lastUpdate).toLocaleString()}`}
            </AlertDescription>
          </Alert>
        )}

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            <>
              <LoadingCard />
              <LoadingCard />
              <LoadingCard />
              <LoadingCard />
            </>
          ) : liveData ? (
            <>
              <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Soil Temperature</CardTitle>
                  <Thermometer className="h-4 w-4" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {convertTempFromX10(liveData.soil_temperature).toFixed(1)}°C
                  </div>
                  <p className="text-xs opacity-80 flex items-center gap-1">
                    {liveData.sensor_status?.ds18b20_working ? 
                      <CheckCircle2 className="w-3 h-3" /> : 
                      <XCircle className="w-3 h-3" />
                    }
                    DS18B20 Sensor
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-r from-orange-500 to-orange-600 text-white">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Air Conditions</CardTitle>
                  <Wind className="h-4 w-4" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {convertTempFromX10(liveData.air_temperature).toFixed(1)}°C
                  </div>
                  <p className="text-xs opacity-80 flex items-center gap-1">
                    {liveData.sensor_status?.dht_working ? 
                      <CheckCircle2 className="w-3 h-3" /> : 
                      <XCircle className="w-3 h-3" />
                    }
                    {liveData.humidity}% Humidity
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Root Zone Moisture</CardTitle>
                  <Droplets className="h-4 w-4" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{liveData.moisture_root}%</div>
                  <p className="text-xs opacity-80 flex items-center gap-1">
                    {liveData.sensor_status?.moisture_working ? 
                      <CheckCircle2 className="w-3 h-3" /> : 
                      <XCircle className="w-3 h-3" />
                    }
                    {getMoistureStatus(liveData.moisture_root).status} Level
                  </p>
                </CardContent>
              </Card>

              <Card className={`bg-gradient-to-r ${liveData.pump_active ? 'from-red-500 to-red-600' : 'from-gray-500 to-gray-600'} text-white`}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Irrigation System</CardTitle>
                  <Power className="h-4 w-4" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold flex items-center gap-2">
                    {liveData.pump_state}
                    {liveData.pump_active && <Activity className="w-5 h-5 animate-pulse" />}
                  </div>
                  <p className="text-xs opacity-80">
                    {liveData.irrigation_reason}
                  </p>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="col-span-full">
              <EmptyState
                icon={Database}
                title="No Live Data Available"
                description="Your AgroFlow device hasn't sent any live data yet. Make sure your ESP32 is connected and running."
                action={
                  <Button onClick={refreshData} variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Check Again
                  </Button>
                }
              />
            </div>
          )}
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="sensors">Sensors</TabsTrigger>
            {/* <TabsTrigger value="irrigation">Irrigation</TabsTrigger> */}
            {/* <TabsTrigger value="analytics">Analytics</TabsTrigger> */}
            <TabsTrigger value="system">System</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Current Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gauge className="w-5 h-5" />
                    Current Conditions
                  </CardTitle>
                  <CardDescription>
                    {liveData?.timestamp ? 
                      `Last updated: ${new Date(liveData.timestamp).toLocaleTimeString()}` : 
                      'No data available'
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full" />
                    </div>
                  ) : liveData ? (
                    <>
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">Surface (0-5cm)</span>
                            <span className="text-sm">{liveData.moisture_surface}%</span>
                          </div>
                          <Progress value={liveData.moisture_surface} className="w-full" />
                        </div>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">Root Zone (10-15cm) ⭐</span>
                            <span className="text-sm font-bold">{liveData.moisture_root}%</span>
                          </div>
                          <Progress value={liveData.moisture_root} className="w-full" />
                        </div>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">Deep (20-25cm)</span>
                            <span className="text-sm">{liveData.moisture_deep}%</span>
                          </div>
                          <Progress value={liveData.moisture_deep} className="w-full" />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="flex items-center gap-2">
                          <Wifi className="w-4 h-4" />
                          <span className="text-sm">
                            WiFi: {getWifiStrength(liveData.wifi_signal).strength} ({liveData.wifi_signal} dBm)
                          </span>
                        </div>
                        <Button
                          variant={liveData.pump_active ? "destructive" : "default"}
                          size="sm"
                          onClick={handlePumpControl}
                          disabled={pumpControlLoading}
                          className="flex items-center gap-1"
                        >
                          <Power className="w-3 h-3" />
                          {pumpControlLoading ? 'Sending...' : `Pump ${liveData.pump_state}`}
                        </Button>
                      </div>
                      
                      <div className="pt-2 border-t space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Today's Irrigations</span>
                          <span className="text-sm font-medium">{liveData.daily_irrigations}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Data Uploads (RTDB/FS)</span>
                          <span className="text-sm font-medium">
                            {liveData.rtdb_uploads}/{liveData.firestore_uploads}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Last Irrigation</span>
                          <span className="text-sm font-medium">
                            {liveData.last_irrigation ? formatTimeAgo(liveData.last_irrigation) : 'Never'}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <EmptyState
                      icon={Gauge}
                      title="No Current Data"
                      description="Waiting for live sensor readings from your AgroFlow device."
                    />
                  )}
                </CardContent>
              </Card>

              {/* 24 Hour Trends */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Moisture Trends (24h)
                  </CardTitle>
                  <CardDescription>
                    Three-layer soil moisture monitoring
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-[200px] w-full" />
                  ) : formatHistoricalData().length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={formatHistoricalData()}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="time" />
                        <YAxis />
                        <Tooltip />
                        <Line 
                          type="monotone" 
                          dataKey="moisture1" 
                          stroke="#94a3b8" 
                          name="Surface"
                          strokeWidth={2}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="moisture2" 
                          stroke="#10b981" 
                          name="Root Zone ⭐"
                          strokeWidth={3}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="moisture3" 
                          stroke="#f59e0b" 
                          name="Deep"
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState
                      icon={TrendingUp}
                      title="No Historical Data"
                      description="Historical charts will appear once your device starts collecting sensor data over time."
                    />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Recent Irrigation Events */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Droplets className="w-5 h-5" />
                  Recent Irrigation Events
                </CardTitle>
                <CardDescription>
                  Latest automatic irrigation cycles
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : irrigationEvents?.length > 0 ? (
                  <div className="space-y-3">
                    {irrigationEvents.slice(0, 5).map((event: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                            event.event === 'started' ? 'bg-blue-500' : 
                            event.event === 'completed' ? 'bg-green-500' : 'bg-gray-500'
                          }`} />
                          <div>
                            <p className="text-sm font-medium">
                              Irrigation {event.event}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(event.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            Root: {event.moisture_root}%
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Daily #{event.daily_count}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={Droplets}
                    title="No Irrigation Events"
                    description="Irrigation events will appear here once your system starts automatic watering."
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sensors" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    Sensor Health
                  </CardTitle>
                  <CardDescription>
                    Current status of all connected sensors
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-4">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  ) : liveData?.sensor_status ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Thermometer className="w-5 h-5 text-blue-500" />
                          <div>
                            <p className="font-medium">DHT11 Sensor</p>
                            <p className="text-sm text-muted-foreground">Air temperature & humidity</p>
                          </div>
                        </div>
                        {/* <Badge variant={liveData.sensor_status.dht_working ? "default" : "destructive"}>
                          {liveData.sensor_status.dht_working ? "Online" : "Offline"}
                        </Badge> */}
                      </div>

                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Thermometer className="w-5 h-5 text-orange-500" />
                          <div>
                            <p className="font-medium">DS18B20 Sensor</p>
                            <p className="text-sm text-muted-foreground">Soil temperature</p>
                          </div>
                        </div>
                        {/* <Badge variant={liveData.sensor_status.ds18b20_working ? "default" : "destructive"}>
                          {liveData.sensor_status.ds18b20_working ? "Online" : "Offline"}
                        </Badge> */}
                      </div>

                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Droplets className="w-5 h-5 text-green-500" />
                          <div>
                            <p className="font-medium">Moisture Sensors</p>
                            <p className="text-sm text-muted-foreground">3-layer soil monitoring</p>
                          </div>
                        </div>
                        {/* <Badge variant={liveData.sensor_status.moisture_working ? "default" : "destructive"}>
                          {liveData.sensor_status.moisture_working ? "Online" : "Offline"}
                        </Badge> */}
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      icon={AlertCircle}
                      title="No Sensor Data"
                      description="Unable to retrieve sensor status information."
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gauge className="w-5 h-5" />
                    Environmental Data
                  </CardTitle>
                  <CardDescription>
                    Real-time environmental conditions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-4">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : liveData ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Thermometer className="w-4 h-4 text-blue-500" />
                          Soil Temperature
                        </span>
                        <span className="font-medium">
                          {convertTempFromX10(liveData.soil_temperature).toFixed(1)}°C
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Wind className="w-4 h-4 text-orange-500" />
                          Air Temperature
                        </span>
                        <span className="font-medium">
                          {convertTempFromX10(liveData.air_temperature).toFixed(1)}°C
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Droplets className="w-4 h-4 text-blue-500" />
                          Air Humidity
                        </span>
                        <span className="font-medium">{liveData.humidity}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Wifi className="w-4 h-4 text-green-500" />
                          WiFi Signal
                        </span>
                        <span className="font-medium">
                          {liveData.wifi_signal} dBm ({getWifiStrength(liveData.wifi_signal).strength})
                        </span>
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      icon={Thermometer}
                      title="No Environmental Data"
                      description="Environmental readings will appear here once sensors are active."
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="irrigation" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Power className="w-5 h-5" />
                    Irrigation Control
                  </CardTitle>
                  <CardDescription>
                    Current pump status and irrigation logic
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-4">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : liveData ? (
                    <div className="space-y-4">
                      <div className={`p-4 rounded-lg border-2 ${
                        liveData.pump_active ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">Pump Status</span>
                          <Badge variant={liveData.pump_active ? "destructive" : "default"}>
                            {liveData.pump_state}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {liveData.irrigation_reason}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span>Today's Irrigations</span>
                          <span className="font-medium">{liveData.daily_irrigations}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Last Irrigation</span>
                          <span className="font-medium">
                            {liveData.last_irrigation ? formatTimeAgo(liveData.last_irrigation) : 'Never'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Root Zone Moisture</span>
                          <span className="font-medium">{liveData.moisture_root}%</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      icon={Power}
                      title="No Irrigation Data"
                      description="Irrigation control status will appear here."
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Irrigation History
                  </CardTitle>
                  <CardDescription>
                    Recent irrigation events and decisions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ) : irrigationEvents?.length > 0 ? (
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {irrigationEvents.slice(0, 10).map((event: any, index: number) => (
                        <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${
                              event.event === 'started' ? 'bg-blue-500' : 'bg-green-500'
                            }`} />
                            <div>
                              <p className="text-sm font-medium">
                                {event.event.charAt(0).toUpperCase() + event.event.slice(1)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(event.timestamp).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">
                              {event.moisture_root}% moisture
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Day #{event.daily_count}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Clock}
                      title="No Irrigation History"
                      description="Irrigation history will appear here once your system starts watering."
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Temperature Trends
                </CardTitle>
                <CardDescription>
                  24-hour temperature comparison (Air vs Soil)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <LoadingChart />
                ) : formatHistoricalData().length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={formatHistoricalData()}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis />
                      <Tooltip />
                      <Line 
                        type="monotone" 
                        dataKey="airTemp" 
                        stroke="#f97316" 
                        name="Air Temperature"
                        strokeWidth={2}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="soilTemp" 
                        stroke="#3b82f6" 
                        name="Soil Temperature"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState
                    icon={TrendingUp}
                    title="No Temperature Data"
                    description="Temperature trends will appear once sensors start collecting data."
                  />
                )}
              </CardContent>
            </Card>

            {formatIrrigationData().length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart className="w-5 h-5" />
                    Irrigation Analysis
                  </CardTitle>
                  <CardDescription>
                    Moisture levels before irrigation events
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={formatIrrigationData()}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Bar 
                        dataKey="moistureBefore" 
                        fill="#10b981" 
                        name="Moisture Before Irrigation"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="system" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    System Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {liveData ? (
                    <>
                      <div className="flex justify-between items-center">
                        <span>Device ID</span>
                        <code className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                          {liveData.device_id}
                        </code>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>System Status</span>
                        <Badge variant={liveData.system_status === 'operational' ? 'default' : 'destructive'}>
                          {liveData.system_status}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>RTDB Uploads</span>
                        <span className="font-medium">{liveData.rtdb_uploads}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Firestore Uploads</span>
                        <span className="font-medium">{liveData.firestore_uploads}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Last Update</span>
                        <span className="font-medium">
                          {new Date(liveData.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </>
                  ) : (
                    <EmptyState
                      icon={Settings}
                      title="No System Data"
                      description="System information will appear once connected."
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    Data Debug
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="showRawData"
                        checked={showRawData}
                        onChange={(e) => setShowRawData(e.target.checked)}
                      />
                      <label htmlFor="showRawData" className="text-sm">
                        Show raw data structure
                      </label>
                    </div>
                    
                    {showRawData && liveData && (
                      <div className="bg-gray-100 p-3 rounded-lg overflow-auto max-h-64">
                        <pre className="text-xs">
                          {JSON.stringify(liveData, null, 2)}
                        </pre>
                      </div>
                    )}

                    <Button onClick={refreshData} className="w-full" disabled={loading}>
                      <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                      Refresh All Data
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
