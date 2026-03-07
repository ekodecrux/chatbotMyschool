import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart3, TrendingUp, AlertCircle, MousePointerClick } from "lucide-react";

export default function Dashboard() {
  const [days, setDays] = useState(7);
  
  const { data: summary, isLoading: summaryLoading } = trpc.analytics.summary.useQuery({ days });
  const { data: searchTrends, isLoading: trendsLoading } = trpc.analytics.searchTrends.useQuery({ days });
  const { data: failedQueries, isLoading: failedLoading } = trpc.analytics.failedQueries.useQuery({ days });
  const { data: popularResources, isLoading: resourcesLoading } = trpc.analytics.popularResources.useQuery({ days });

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Teacher Dashboard</h1>
          <p className="text-gray-600">Analytics and insights to improve chatbot accuracy</p>
        </div>

        <div className="flex gap-2 mb-6">
          <Button
            variant={days === 7 ? "default" : "outline"}
            onClick={() => setDays(7)}
            className={days === 7 ? "bg-pink-600 hover:bg-pink-700" : ""}
          >
            Last 7 Days
          </Button>
          <Button
            variant={days === 30 ? "default" : "outline"}
            onClick={() => setDays(30)}
            className={days === 30 ? "bg-pink-600 hover:bg-pink-700" : ""}
          >
            Last 30 Days
          </Button>
          <Button
            variant={days === 90 ? "default" : "outline"}
            onClick={() => setDays(90)}
            className={days === 90 ? "bg-pink-600 hover:bg-pink-700" : ""}
          >
            Last 90 Days
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Searches</CardTitle>
              <BarChart3 className="h-4 w-4 text-pink-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{summaryLoading ? "..." : summary?.totalSearches || 0}</div>
              <p className="text-xs text-gray-500 mt-1">User queries processed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Failed Searches</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">{summaryLoading ? "..." : summary?.failedSearches || 0}</div>
              <p className="text-xs text-gray-500 mt-1">No results found</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Resource Clicks</CardTitle>
              <MousePointerClick className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{summaryLoading ? "..." : summary?.totalClicks || 0}</div>
              <p className="text-xs text-gray-500 mt-1">Links clicked by users</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Unique Queries</CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{summaryLoading ? "..." : summary?.uniqueQueries || 0}</div>
              <p className="text-xs text-gray-500 mt-1">Different search terms</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="trends" className="space-y-6">
          <TabsList className="bg-white border">
            <TabsTrigger value="trends">Search Trends</TabsTrigger>
            <TabsTrigger value="failed">Failed Queries</TabsTrigger>
            <TabsTrigger value="popular">Popular Resources</TabsTrigger>
          </TabsList>

          <TabsContent value="trends">
            <Card>
              <CardHeader>
                <CardTitle>Top Search Terms</CardTitle>
                <CardDescription>Most frequently searched queries by users</CardDescription>
              </CardHeader>
              <CardContent>
                {trendsLoading ? (
                  <p className="text-center py-8 text-gray-500">Loading...</p>
                ) : searchTrends && searchTrends.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rank</TableHead>
                        <TableHead>Search Query</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {searchTrends.map((trend: any, index: number) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">#{index + 1}</TableCell>
                          <TableCell>{trend.query}</TableCell>
                          <TableCell className="text-right font-bold">{trend.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center py-8 text-gray-500">No search data available</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="failed">
            <Card>
              <CardHeader>
                <CardTitle>Failed Queries</CardTitle>
                <CardDescription>Searches that returned no results - add these to knowledge base</CardDescription>
              </CardHeader>
              <CardContent>
                {failedLoading ? (
                  <p className="text-center py-8 text-gray-500">Loading...</p>
                ) : failedQueries && failedQueries.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Query</TableHead>
                        <TableHead>Language</TableHead>
                        <TableHead>Translated</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {failedQueries.map((query: any) => (
                        <TableRow key={query.id}>
                          <TableCell className="font-medium">{query.query}</TableCell>
                          <TableCell>{query.language.toUpperCase()}</TableCell>
                          <TableCell>{query.translatedQuery || "-"}</TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {new Date(query.createdAt).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center py-8 text-gray-500">No failed queries - great job!</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="popular">
            <Card>
              <CardHeader>
                <CardTitle>Popular Resources</CardTitle>
                <CardDescription>Most clicked resources by users</CardDescription>
              </CardHeader>
              <CardContent>
                {resourcesLoading ? (
                  <p className="text-center py-8 text-gray-500">Loading...</p>
                ) : popularResources && popularResources.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rank</TableHead>
                        <TableHead>Resource</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Clicks</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {popularResources.map((resource: any, index: number) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">#{index + 1}</TableCell>
                          <TableCell>
                            <a 
                              href={resource.resourceUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-pink-600 hover:underline"
                            >
                              {resource.resourceName}
                            </a>
                          </TableCell>
                          <TableCell>
                            <span className="px-2 py-1 bg-pink-100 text-pink-800 rounded text-xs">
                              {resource.category || "general"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-bold">{resource.clickCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center py-8 text-gray-500">No click data available</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
