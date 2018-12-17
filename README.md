# Finding the shortest path in a road network with PgRouting + Geoserver + Leaflet JS

This repository contains the accompaning code and writeup for this [Youtube tutorial series](https://www.youtube.com/watch?v=6gfdQmFkVmE&list=PLaOYwKHOUv7Z2KyZNTXhLhwYm-XeEs34H) I did on creating a routing web app with pgRouting together with Geoserver and Leaflet JS.

## Requirements as used in this example:
- PostgreSQL   - 9.5.13
- Postgis  - 2.3.3
- Pgrouting 2.5.2
- Geoserver - 2.10.4
- [Leaflet JS](https://leafletjs.com) - 1.0.3
- OS used in this example - [OSGEO Live - Lubuntu](https://live.osgeo.org/en/index.html)

### Step 1: Create database with the required extensions
Create database - `here named as routing`. Replace `<user>` with your database user.

`createdb routing -U <user>`

Add postgis extension:

`psql -U <user> -c "CREATE EXTENSION postgis;"  routing`

Add pgRouting extension:

`psql -U <user> -c "CREATE EXTENSION pgrouting;"  routing`


### Step 2: Load network data to db using ogr2ogr/osm2psql/shapeloader etc..

Here we are using ogr2ogr to load roads.geojson (obtained from OSM)  for a section of Nairobi. Again do not forget to replace `<user>` with your database user.

`ogr2ogr -select 'name,highway,oneway,surface' -lco GEOMETRY_NAME=the_geom -lco FID=id -f PostgreSQL PG:"dbname=routing user=<user>" -nln edges roads.geojson`

A few things note on the above ogr2ogr command:
-  `-select ‘name,highway,oneway,surface’`:  Select the desired attributes/fields only from the data file. Other attributes in the data will not be imported
-  `-f PostgreSQL PG:”dbname=routing user=<user>`:  Load the data into Postgres with `<user>` and db `routing`
- `-lco GEOMETRY_NAME=the_geom`:  Store the geometry in a field named the_geom
- `-nlco FID=id`:  Store the feature identifier in a field named id
- `-nln edges`:  Store the data in a table called edges

For more details on the possible options, please refer [this ogr2ogr](https://www.gdal.org/ogr2ogr.html) documentation


### Step 3: Add source and target  columns

To accommodate `pgr_createTopology`, we need to add source and target columns to our edges table and then execute the command. Note that we have to indicate the name of the table (‘edges’) and the tolerance for considering two vertices as the same in the network.

**First fire up the `psql` client with the correct `user` and `database`:**

`psql -U <user> -d routing`

**And then create the columns by typing the following:**

`ALTER TABLE edges ADD source INT4;`
`ALTER TABLE edges ADD target INT4;`

### Step 4: Split nodes to be used in creating topology

`SELECT pgr_nodeNetwork('edges', 0.00001);`

**NOTE**
We are using a tolerance of 0.00001 because our data is in EPSG:4326 (meter as projection unit - points have to be less than 0.00001 meters away from each other)
**Reference**:
https://gis.stackexchange.com/questions/229452/pgr-createtopology-how-tolerance

For details on `pgr_nodeNetwork` function please refer from [here](https://docs.pgrouting.org/2.5/en/pgr_nodeNetwork.html#pgr-node-network)


### Step 5 : Create topology
`SELECT pgr_createTopology('edges_noded', 0.00001);`

Details on `pgr_createTopology` function [here](https://docs.pgrouting.org/2.5/en/pgr_createTopology.html#pgr-create-topology)


### Step 6 : Copy  attribute information from the original table to the new noded table

 **Add Columns first:**
```
ALTER TABLE edges_noded
 ADD COLUMN name VARCHAR,
 ADD COLUMN type VARCHAR;
 ```

**Copy the data from the original table:**

```
UPDATE edges_noded AS new
 SET name=old.name, 
   type=old.highway 
FROM edges as old
WHERE new.old_id=old.id;
```

### Step 7: Determine Cost

We will simply use distance as the costing factor. Note you can also use other parameters like type of road, traffic etc..

**Precalculate distance to save geoserver from calculating on each request:**

**Add Distance Column**

`ALTER TABLE edges_noded ADD distance FLOAT8;`

**Calculate distances in meters:**

`UPDATE edges_noded SET distance = ST_Length(ST_Transform(the_geom, 4326)::geography) / 1000;`

### Step 8 : Test shortest path with Dijkistra algorithm

`SELECT * FROM pgr_dijkstra('SELECT id,source,target,distance as cost FROM edges_noded',1,2,false);`

For details on `pgr_dijkstra` please [check here](https://docs.pgrouting.org/2.5/en/pgr_dijkstra.html#pgr-dijkstra)


### Step 9: Publishing to geoserver
Create  2 parameterized SQL Views to have the following code:

1. **Nearest Vertex SQL View**
```
SELECT
  v.id,
  v.the_geom,
  string_agg(distinct(e.name),',') AS name
FROM
  edges_noded_vertices_pgr AS v,
  edges_noded AS e
WHERE
  v.id = (SELECT
            id
          FROM edges_noded_vertices_pgr
          ORDER BY the_geom <-> ST_SetSRID(ST_MakePoint(%x%, %y%), 4326) LIMIT 1)
  AND (e.source = v.id OR e.target = v.id)
GROUP BY v.id, v.the_geom
```

**Validation for parametes**
To ensure that the sql view gets the correct parameters, add the below validation that checks the values as float type in the geoserver sql view under the parameters:

`^[\d\.\+-eE]+$`

2. **Shortest Path SQL View**
```
SELECT
 min(r.seq) AS seq,
 e.old_id AS id,
 e.name,
 e.type,
 sum(e.distance) AS distance,
ST_Collect(e.the_geom) AS geom 
 FROM pgr_dijkstra('SELECT id,source,target,distance AS cost 
 FROM edges_noded',%source%,%target%,false) AS r,edges_noded AS e 
 WHERE r.edge=e.id GROUP BY e.old_id,e.name,e.type
```
 **Validation**
 Ensure parameters are integers

`^[\d]+$`

 ### Step 10 : Leaflet JS Client
 
 Please take a look at the code and it should be easy to follow along with the comments in the code
