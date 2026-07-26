import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SocialMediaFlow } from './SocialMediaFlow'
import { B2cOrganicPostsFlow } from './B2cOrganicPostsFlow'
import { Image as ImageIcon, Workflow } from 'lucide-react'

type Props = {
  initialPlatforms?: string[]
  initialObjective?: string
  initialFormat?: string
  initialHorizon?: string
}

/**
 * Social Media module shell:
 * - B2C Organic: image posts with Post / Schedule CTAs
 * - Campaign: existing multi-stage social campaign engine
 */
export function SocialMediaHub({
  initialPlatforms,
  initialObjective,
  initialFormat,
  initialHorizon,
}: Props) {
  const [tab, setTab] = useState('b2c-organic')

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex h-full flex-col">
      <div className="border-b border-border/60 px-4 pt-3 pb-2">
        <TabsList className="h-auto flex-wrap gap-1 rounded-[1.25rem] border border-border/70 bg-muted/50 p-1.5">
          <TabsTrigger value="b2c-organic" className="gap-1.5">
            <ImageIcon className="h-3.5 w-3.5" /> B2C Organic Posts
          </TabsTrigger>
          <TabsTrigger value="campaign" className="gap-1.5">
            <Workflow className="h-3.5 w-3.5" /> Campaign Engine
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="b2c-organic" className="mt-0 flex-1 overflow-auto p-4 data-[state=inactive]:hidden">
        <B2cOrganicPostsFlow />
      </TabsContent>
      <TabsContent value="campaign" className="mt-0 flex-1 overflow-auto data-[state=inactive]:hidden">
        <SocialMediaFlow
          initialPlatforms={initialPlatforms}
          initialObjective={initialObjective}
          initialFormat={initialFormat}
          initialHorizon={initialHorizon}
        />
      </TabsContent>
    </Tabs>
  )
}
