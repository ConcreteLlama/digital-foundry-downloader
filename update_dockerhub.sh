## how to get ver from package.json withut jq?
VERSION=`cat package.json | grep version | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | tr -d '[[:space:]]'`
echo "Version is $VERSION"

DEPLOYMENT_TYPE=$1

TAG="v$VERSION"

if [[ $DEPLOYMENT_TYPE == "" ]]; then
   echo "Must supply deploymnet as arg (stable or development)"
   exit 1
fi
if [[ $DEPLOYMENT_TYPE != "stable" && $DEPLOYMENT_TYPE != "development" ]]; then
   echo "Must supply deploymnet as arg (stable or development)"
   exit 1
fi

if [[ $DEPLOYMENT_TYPE == "stable" ]]; then
   LATEST_TAG="latest"
else
   LATEST_TAG="development"
   TAG=$TAG-$DEPLOYMENT_TYPE
fi

echo "About to update dockerhub with version $VERSION, deployment type $DEPLOYMENT_TYPE"
echo "This will update the following tags:"
echo "  $LATEST_TAG"
echo "  $TAG"

read -p "Is this correct? (y/n) " -n 1 -r
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
   echo "Exiting"
   exit 1
fi

./update_container.sh digital-foundry-downloader:$LATEST_TAG concretellama
docker tag concretellama/digital-foundry-downloader:$LATEST_TAG concretellama/digital-foundry-downloader:$TAG
docker push concretellama/digital-foundry-downloader:$TAG